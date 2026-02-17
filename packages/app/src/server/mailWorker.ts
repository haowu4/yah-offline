import { AppCtx } from "../appCtx.js"
import { createMailLLM } from "../llm/mail.js"
import { MailStreamEvent } from "../type/mail.js"

type Subscriber = {
  id: number
  send: (args: { id: number; event: MailStreamEvent }) => void
}

function parseInteger(input: string | null, defaultValue: number): number {
  if (!input) return defaultValue
  const parsed = Number.parseInt(input, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue
}

function estimateTokenCount(content: string): number {
  return Math.ceil(content.length / 4)
}

function deriveTitleFromReply(content: string): string {
  const normalized = content
    .replace(/[#>*`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!normalized) return "Untitled thread"
  if (normalized.length <= 64) return normalized
  return `${normalized.slice(0, 61)}...`
}

export class MailEventHub {
  private subscribers = new Map<number, Subscriber>()
  private nextSubscriberId = 1
  private appCtx: AppCtx

  constructor(appCtx: AppCtx) {
    this.appCtx = appCtx
  }

  subscribe(send: (args: { id: number; event: MailStreamEvent }) => void): () => void {
    const id = this.nextSubscriberId
    this.nextSubscriberId += 1
    this.subscribers.set(id, { id, send })

    return () => {
      this.subscribers.delete(id)
    }
  }

  emit(event: MailStreamEvent): number {
    const mailDB = this.appCtx.dbClients.mail()
    const eventId = mailDB.appendEvent(event.type, JSON.stringify(event))

    for (const subscriber of this.subscribers.values()) {
      subscriber.send({ id: eventId, event })
    }

    return eventId
  }

  replayAfter(lastEventId: number): Array<{ id: number; event: MailStreamEvent }> {
    const mailDB = this.appCtx.dbClients.mail()
    return mailDB.listEventsAfterId(lastEventId).flatMap((row) => {
      try {
        return [{ id: row.id, event: JSON.parse(row.payloadJson) as MailStreamEvent }]
      } catch {
        return []
      }
    })
  }
}

export function startMailWorker(appCtx: AppCtx, eventHub: MailEventHub): () => void {
  const mailDB = appCtx.dbClients.mail()
  const configDB = appCtx.dbClients.config()
  let llm: ReturnType<typeof createMailLLM> | null = null

  let stopped = false
  let isRunning = false
  let currentJobId: number | null = null
  let currentThreadUid: string | null = null

  const runOnce = async () => {
    if (stopped || isRunning) return
    isRunning = true

    try {
      const job = mailDB.claimNextQueuedJob()
      if (!job) return
      currentJobId = job.id
      if (!llm) {
        llm = createMailLLM(appCtx.config.api.apiKey)
      }

      const thread = mailDB.getThreadById(job.threadId)
      if (!thread) {
        mailDB.failJob(job.id, "Thread not found")
        currentJobId = null
        return
      }
      currentThreadUid = thread.threadUid

      eventHub.emit({
        type: "mail.job.started",
        jobId: job.id,
        threadUid: thread.threadUid,
        userReplyId: job.userReplyId,
      })

      const threadDetail = mailDB.getThreadDetailByUid(thread.threadUid)
      if (!threadDetail) {
        mailDB.failJob(job.id, "Thread detail not found")
        return
      }

      const userReply = threadDetail.replies.find((reply) => reply.id === job.userReplyId)
      if (!userReply) {
        mailDB.failJob(job.id, "User reply not found")
        return
      }

      const requestedContact = job.requestedContactId
        ? mailDB.getContactById(job.requestedContactId)
        : null

      const systemPrompt =
        configDB.getValue("mail.context.system_prompt") ||
        "You are a mail assistant. Respond helpfully in markdown."
      const maxMessages = parseInteger(configDB.getValue("mail.context.max_messages"), 20)
      const summaryTriggerTokenCount = parseInteger(
        configDB.getValue("mail.context.summary_trigger_token_count"),
        5000
      )
      const configuredDefaultModel = configDB.getValue("mail.default_model")

      const model = mailDB.resolveModel({
        requestedModel: job.requestedModel,
        contactId: requestedContact?.id ?? null,
        configDefaultModel: configuredDefaultModel,
      })

      const fullHistory = threadDetail.replies
      const contextWindow = fullHistory.slice(Math.max(fullHistory.length - maxMessages, 0))

      const currentContext =
        requestedContact == null
          ? null
          : mailDB.getThreadContactContext({
              threadId: thread.id,
              contactId: requestedContact.id,
            })

      const estimatedTokens = estimateTokenCount(
        fullHistory.map((item) => item.content).join("\n\n")
      )

      let summary = currentContext?.summaryText || ""
      if (
        requestedContact &&
        estimatedTokens >= summaryTriggerTokenCount &&
        (!currentContext || currentContext.summaryTokenCount < estimatedTokens)
      ) {
        summary = await llm.summarize({
          model,
          systemPrompt,
          contactInstruction: requestedContact.instruction,
          messages: fullHistory.map((item) => ({
            role: item.role,
            content: item.content,
            contactName: item.contact?.name ?? null,
          })),
        })

        mailDB.upsertThreadContactContext({
          threadId: thread.id,
          contactId: requestedContact.id,
          summaryText: summary,
          summaryTokenCount: estimatedTokens,
          lastSummarizedReplyId: fullHistory[fullHistory.length - 1]?.id ?? null,
        })
      }

      const replyResult = await llm.generateReply({
        model,
        systemPrompt,
        contactInstruction: requestedContact?.instruction ?? "",
        summary,
        history: contextWindow.map((item) => ({
          role: item.role,
          content: item.content,
          contactName: item.contact?.name ?? null,
        })),
        userInput: userReply.content,
      })

      const assistantReply = mailDB.createReply({
        threadId: thread.id,
        role: "assistant",
        contactId: requestedContact?.id ?? null,
        model,
        content: replyResult.content,
        unread: true,
        status: "completed",
      })

      for (const attachment of replyResult.attachments) {
        if (attachment.kind === "text") {
          mailDB.createAttachment({
            replyId: assistantReply.id,
            filename: attachment.filename,
            kind: "text",
            mimeType: "text/plain; charset=utf-8",
            textContent: attachment.content,
            toolName: "createTextFile",
            modelQuality: attachment.modelQuality,
          })
          continue
        }

        const image = await llm.createImage({
          prompt: attachment.prompt,
          modelQuality: attachment.modelQuality,
        })

        mailDB.createAttachment({
          replyId: assistantReply.id,
          filename: attachment.filename,
          kind: "image",
          mimeType: image.mimeType,
          binaryContent: image.binary,
          toolName: "createImageFile",
          modelQuality: attachment.modelQuality,
        })
      }

      if (!thread.title.trim()) {
        const generatedTitle = deriveTitleFromReply(userReply.content || assistantReply.content)
        mailDB.updateThreadTitle(thread.id, generatedTitle)
      }

      mailDB.completeJob(job.id)

      const threadAfter = mailDB.getThreadById(thread.id)
      const unreadForThread = mailDB.getThreadUnreadCount(thread.id)
      const unreadStats = mailDB.getUnreadStats()

      eventHub.emit({
        type: "mail.reply.created",
        threadUid: thread.threadUid,
        replyId: assistantReply.id,
        unreadCount: unreadForThread,
      })

      eventHub.emit({
        type: "mail.thread.updated",
        threadUid: thread.threadUid,
        updatedAt: threadAfter?.updatedAt ?? new Date().toISOString(),
      })

      eventHub.emit({
        type: "mail.unread.changed",
        threadUid: thread.threadUid,
        unreadCount: unreadForThread,
        totalUnreadReplies: unreadStats.totalUnreadReplies,
        totalUnreadThreads: unreadStats.totalUnreadThreads,
      })
      currentJobId = null
      currentThreadUid = null
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown mail worker error"
      if (currentJobId && currentThreadUid) {
        mailDB.failJob(currentJobId, message)
        eventHub.emit({
          type: "mail.reply.failed",
          jobId: currentJobId,
          threadUid: currentThreadUid,
          message,
        })
      }
    } finally {
      currentJobId = null
      currentThreadUid = null
      isRunning = false
    }
  }

  const interval = setInterval(() => {
    void runOnce()
  }, 800)

  return () => {
    stopped = true
    clearInterval(interval)
  }
}
