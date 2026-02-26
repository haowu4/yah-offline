import { AppCtx } from "../../../appCtx.js"
import { createCallId, errorDetails, logDebugJson, logLine } from "../../../logging/index.js"
import { AbstractMagicApi } from "../../../magic/api.js"
import { MailReplyJobPayload } from "../../../type/llm.js"
import { EventDispatcher } from "../eventDispatcher.js"
import { LLMRuntimeConfigCache } from "../runtimeConfigCache.js"

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

function formatLogContext(args: {
  threadId?: number | null
  replyId?: number | null
}): string {
  return `thread_id=${args.threadId ?? "-"} reply_id=${args.replyId ?? "-"}`
}

async function withTimeout<T>(run: () => Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      reject(new Error(`LLM request timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    run()
      .then((result) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      })
      .catch((error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      })
  })
}

export function createMailReplyHandler(args: {
  appCtx: AppCtx
  eventDispatcher: EventDispatcher
  runtimeConfigCache: LLMRuntimeConfigCache
  magicApi: AbstractMagicApi
}): (payload: MailReplyJobPayload & { jobId: number }) => Promise<void> {
  const mailDB = args.appCtx.dbClients.mail()
  const magicApiWithContext = args.magicApi as AbstractMagicApi & {
    withExecutionContext?: <T>(args: {
      context: {
        mailModelOverride?: string
      }
      run: () => Promise<T>
    }) => Promise<T>
  }

    const callWithRetry = async <T>(callArgs: {
      trigger: "reply-generation" | "summary-generation" | "image-generation"
      logContext: {
        threadId?: number | null
        replyId?: number | null
      }
      run: () => Promise<T>
    }): Promise<T> => {
    const runtimeConfig = args.runtimeConfigCache.get()
    let lastError: unknown = null

    for (let attempt = 1; attempt <= runtimeConfig.llmRetryMaxAttempts; attempt += 1) {
      const callId = createCallId()
      const startMs = Date.now()
      try {
        const result = await withTimeout(callArgs.run, runtimeConfig.llmRequestTimeoutMs)
        const durationMs = Date.now() - startMs
        logLine(
          "info",
          `LLM mail ${callArgs.trigger} ${formatLogContext(callArgs.logContext)} provider=${args.magicApi.providerName({})} ok ${durationMs}ms attempt=${attempt} cid=${callId}`
        )
        logDebugJson(args.appCtx.config.app.debug, {
          event: "llm.call",
          provider: args.magicApi.providerName({}),
          operation: `magic.${callArgs.trigger}`,
          component: "mail",
          trigger: callArgs.trigger,
          ...callArgs.logContext,
          status: "ok",
          durationMs,
          attempt,
          timeoutMs: runtimeConfig.llmRequestTimeoutMs,
          callId,
        })
        return result
      } catch (error) {
        lastError = error
        const durationMs = Date.now() - startMs
        const details = errorDetails(error)
        logLine(
          "error",
          `LLM mail ${callArgs.trigger} ${formatLogContext(callArgs.logContext)} provider=${args.magicApi.providerName({})} error ${durationMs}ms attempt=${attempt} cid=${callId} msg="${details.errorMessage}"`
        )
        logDebugJson(args.appCtx.config.app.debug, {
          level: "error",
          event: "llm.call",
          provider: args.magicApi.providerName({}),
          operation: `magic.${callArgs.trigger}`,
          component: "mail",
          trigger: callArgs.trigger,
          ...callArgs.logContext,
          status: "error",
          durationMs,
          attempt,
          timeoutMs: runtimeConfig.llmRequestTimeoutMs,
          callId,
          errorName: details.errorName,
          errorMessage: details.errorMessage,
        })
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Mail generation failed")
  }

  return async (payload) => {
    const runtimeConfig = args.runtimeConfigCache.get()

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

    const maxMessages = runtimeConfig.mailContextMaxMessages
    const summaryTriggerTokenCount = runtimeConfig.mailContextSummaryTriggerTokenCount

    const model = mailDB.resolveModel({
      requestedModel: payload.requestedModel,
      configDefaultModel: null,
    })

    const fullHistory = threadDetail.replies
    const contextWindow = fullHistory.slice(Math.max(fullHistory.length - maxMessages, 0))

    const currentContext = mailDB.getThreadContext({
      threadId: thread.id,
    })

    const estimatedTokens = estimateTokenCount(
      fullHistory.map((item) => item.content).join("\n\n")
    )

    let summary = currentContext?.summaryText || ""
    if (
      estimatedTokens >= summaryTriggerTokenCount &&
      (!currentContext || currentContext.summaryTokenCount < estimatedTokens)
    ) {
      const summaryResult = await callWithRetry({
        trigger: "summary-generation",
        logContext: {
          threadId: thread.id,
          replyId: userReply.id,
        },
        run: () =>
          args.magicApi.summarize({
            messages: fullHistory.map((item) => ({
              role: item.role,
              content: item.content,
            })),
          }),
      })
      summary = summaryResult.summary

      mailDB.upsertThreadContext({
        threadId: thread.id,
        summaryText: summary,
        summaryTokenCount: estimatedTokens,
        lastSummarizedReplyId: fullHistory[fullHistory.length - 1]?.id ?? null,
      })
    }

    const replyResult = await callWithRetry({
      trigger: "reply-generation",
      logContext: {
        threadId: thread.id,
        replyId: userReply.id,
      },
      run: () => {
        const runCreateReply = () =>
          args.magicApi.createReply({
            summary,
            history: contextWindow.map((item) => ({
              role: item.role,
              content: item.content,
            })),
            userInput: userReply.content,
            attachmentPolicy: {
              maxCount: runtimeConfig.mailAttachmentsMaxCount,
              maxTextChars: runtimeConfig.mailAttachmentsMaxTextChars,
            },
          })

        return magicApiWithContext.withExecutionContext
          ? magicApiWithContext.withExecutionContext({
              context: { mailModelOverride: model },
              run: runCreateReply,
            })
          : runCreateReply()
      },
    })

    const preparedAttachments: Array<
      | {
          kind: "text"
          filename: string
          quality: "low" | "normal" | "high"
          textContent: string
        }
      | {
          kind: "image"
          filename: string
          quality: "low" | "normal" | "high"
          mimeType: string
          binaryContent: Buffer
        }
    > = []

    for (const attachment of replyResult.attachments) {
      if (attachment.kind === "text") {
        preparedAttachments.push({
          kind: "text",
          filename: attachment.filename,
          quality: attachment.quality,
          textContent: attachment.content,
        })
        continue
      }

      const image = await callWithRetry({
        trigger: "image-generation",
        logContext: {
          threadId: thread.id,
          replyId: userReply.id,
        },
        run: () =>
          args.magicApi.createImage({
            description: attachment.description,
            quality: attachment.quality,
          }),
      })

      preparedAttachments.push({
        kind: "image",
        filename: attachment.filename,
        quality: attachment.quality,
        mimeType: image.mimeType,
        binaryContent: image.binary,
      })
    }

    const assistantReply = mailDB.createReply({
      threadId: thread.id,
      role: "assistant",
      model,
      content: replyResult.content,
      unread: true,
      status: "completed",
    })

    for (const attachment of preparedAttachments) {
      if (attachment.kind === "text") {
        mailDB.createAttachment({
          replyId: assistantReply.id,
          filename: attachment.filename,
          kind: "text",
          mimeType: "text/plain; charset=utf-8",
          textContent: attachment.textContent,
          toolName: "createTextFile",
          modelQuality: attachment.quality,
        })
        continue
      }

      mailDB.createAttachment({
        replyId: assistantReply.id,
        filename: attachment.filename,
        kind: "image",
        mimeType: attachment.mimeType,
        binaryContent: attachment.binaryContent,
        toolName: "createImageFile",
        modelQuality: attachment.quality,
      })
    }

    if (!thread.userSetTitle && !thread.title.trim()) {
      const generatedTitle = deriveTitleFromReply(userReply.content || assistantReply.content)
      mailDB.updateThreadTitle(thread.id, generatedTitle, { userSetTitle: false })
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
