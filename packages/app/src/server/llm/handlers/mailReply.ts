import { AppCtx } from "../../../appCtx.js"
import { createMailLLM } from "../../../llm/mail.js"
import { MailReplyJobPayload } from "../../../type/llm.js"
import { EventDispatcher } from "../eventDispatcher.js"

function parseInteger(input: string | null, defaultValue: number): number {
  if (!input) return defaultValue
  const parsed = Number.parseInt(input, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue
}

function parsePositiveIntOrDefault(input: string | null, defaultValue: number): number {
  return parseInteger(input, defaultValue)
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

export function createMailReplyHandler(args: {
  appCtx: AppCtx
  eventDispatcher: EventDispatcher
}): (payload: MailReplyJobPayload & { jobId: number }) => Promise<void> {
  const mailDB = args.appCtx.dbClients.mail()
  const configDB = args.appCtx.dbClients.config()

  let llm: ReturnType<typeof createMailLLM> | null = null

  return async (payload) => {
    if (!llm) {
      llm = createMailLLM(args.appCtx.config.api.apiKey, {
        retryMaxAttempts: parsePositiveIntOrDefault(
          configDB.getValue("llm.retry.max_attempts"),
          2
        ),
        requestTimeoutMs: parsePositiveIntOrDefault(
          configDB.getValue("llm.retry.timeout_ms"),
          20000
        ),
        maxAttachments: parsePositiveIntOrDefault(
          configDB.getValue("mail.attachments.max_count"),
          3
        ),
        maxTextAttachmentChars: parsePositiveIntOrDefault(
          configDB.getValue("mail.attachments.max_text_chars"),
          20000
        ),
        debug: args.appCtx.config.app.debug,
      })
    }

    const thread = mailDB.getThreadById(payload.threadId)
    if (!thread) {
      throw new Error("Thread not found")
    }

    args.eventDispatcher.emit({
      topic: "mail",
      entityId: thread.threadUid,
      event: {
        type: "mail.job.started",
        jobId: payload.jobId,
        threadUid: thread.threadUid,
        userReplyId: payload.userReplyId,
      },
    })

    const threadDetail = mailDB.getThreadDetailByUid(thread.threadUid)
    if (!threadDetail) {
      throw new Error("Thread detail not found")
    }

    const userReply = threadDetail.replies.find((reply) => reply.id === payload.userReplyId)
    if (!userReply) {
      throw new Error("User reply not found")
    }

    const requestedContact = payload.requestedContactId
      ? mailDB.getContactById(payload.requestedContactId)
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
    const configuredSummaryModel = configDB.getValue("mail.summary_model")

    const model = mailDB.resolveModel({
      requestedModel: payload.requestedModel,
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
        model: configuredSummaryModel?.trim() || "gpt-5-mini",
        systemPrompt,
        contactInstruction: requestedContact.instruction,
        messages: fullHistory.map((item) => ({
          role: item.role,
          content: item.content,
          contactName: item.contact?.name ?? null,
        })),
        logContext: {
          threadId: thread.id,
          replyId: userReply.id,
          contactId: requestedContact.id,
        },
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
      logContext: {
        threadId: thread.id,
        replyId: userReply.id,
        contactId: requestedContact?.id ?? null,
      },
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
        logContext: {
          threadId: thread.id,
          replyId: userReply.id,
          contactId: requestedContact?.id ?? null,
        },
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

    const threadAfter = mailDB.getThreadById(thread.id)
    const unreadForThread = mailDB.getThreadUnreadCount(thread.id)
    const unreadStats = mailDB.getUnreadStats()

    args.eventDispatcher.emit({
      topic: "mail",
      entityId: thread.threadUid,
      event: {
        type: "mail.reply.created",
        threadUid: thread.threadUid,
        replyId: assistantReply.id,
        unreadCount: unreadForThread,
      },
    })

    args.eventDispatcher.emit({
      topic: "mail",
      entityId: thread.threadUid,
      event: {
        type: "mail.thread.updated",
        threadUid: thread.threadUid,
        updatedAt: threadAfter?.updatedAt ?? new Date().toISOString(),
      },
    })

    args.eventDispatcher.emit({
      topic: "mail",
      entityId: thread.threadUid,
      event: {
        type: "mail.unread.changed",
        threadUid: thread.threadUid,
        unreadCount: unreadForThread,
        totalUnreadReplies: unreadStats.totalUnreadReplies,
        totalUnreadThreads: unreadStats.totalUnreadThreads,
      },
    })
  }
}
