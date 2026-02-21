import { AppCtx } from "../../appCtx.js"
import { logDebugJson, logLine } from "../../logging/index.js"
import { MailReplyJobPayload, SearchGenerateJobPayload } from "../../type/llm.js"
import { EventDispatcher } from "./eventDispatcher.js"
import { createMailReplyHandler } from "./handlers/mailReply.js"
import { createSearchGenerateHandler } from "./handlers/searchGenerate.js"
import { LLMRuntimeConfigCache } from "./runtimeConfigCache.js"
import { createMagicApi } from "../../magic/factory.js"

function parsePayload<T>(payloadJson: string): T {
  return JSON.parse(payloadJson) as T
}

function retryDelaySecondsForAttempt(attempt: number): number {
  if (attempt <= 1) return 2
  if (attempt <= 2) return 5
  return 10
}

export function startLLMWorker(appCtx: AppCtx, eventDispatcher: EventDispatcher): () => void {
  const llmDB = appCtx.dbClients.llm()
  const runtimeConfigCache = new LLMRuntimeConfigCache(appCtx, 5000)
  const magicApi = createMagicApi({ appCtx })
  const mailReplyHandler = createMailReplyHandler({
    appCtx,
    eventDispatcher,
    runtimeConfigCache,
    magicApi,
  })
  const searchGenerateHandler = createSearchGenerateHandler({
    appCtx,
    eventDispatcher,
    runtimeConfigCache,
    magicApi,
  })

  let stopped = false
  let isRunning = false

  const runOnce = async () => {
    if (stopped || isRunning) return
    isRunning = true

    try {
      llmDB.requeueExpiredRunningJobs(300)

      const job = llmDB.claimNextQueuedJob()
      if (!job) return

      try {
        if (job.kind === "mail.reply") {
          await mailReplyHandler({
            ...parsePayload<MailReplyJobPayload>(job.payloadJson),
            jobId: job.id,
          })
        } else if (job.kind === "search.generate") {
          await searchGenerateHandler({
            ...parsePayload<SearchGenerateJobPayload>(job.payloadJson),
          })
        } else {
          llmDB.failJob(job.id, `Unknown LLM job kind: ${job.kind}`)
          return
        }

        llmDB.completeJob(job.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown LLM worker error"
        if (job.attempts < job.maxAttempts) {
          llmDB.retryJob(job.id, message, retryDelaySecondsForAttempt(job.attempts))
        } else {
          llmDB.failJob(job.id, message)

          if (job.kind === "mail.reply") {
            const payload = parsePayload<MailReplyJobPayload>(job.payloadJson)
            const thread = appCtx.dbClients.mail().getThreadById(payload.threadId)
            if (thread) {
              eventDispatcher.emit({
                topic: "mail",
                entityId: thread.threadUid,
                event: {
                  type: "mail.reply.failed",
                  jobId: job.id,
                  threadUid: thread.threadUid,
                  message,
                },
              })
            }
          }

          if (job.kind === "search.generate") {
            const payload = parsePayload<SearchGenerateJobPayload>(job.payloadJson)
            eventDispatcher.emit({
              topic: "search.query",
              entityId: `query:${payload.queryId}`,
              event: {
                type: "query.error",
                queryId: payload.queryId,
                message,
              },
            })
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown LLM worker fatal error"
      logLine("error", `LLM worker loop failed: ${message}`)
      logDebugJson(appCtx.config.app.debug, {
        level: "error",
        event: "llm.worker.error",
        message,
      })
    } finally {
      isRunning = false
    }
  }

  const interval = setInterval(() => {
    void runOnce()
  }, 500)

  return () => {
    stopped = true
    clearInterval(interval)
  }
}
