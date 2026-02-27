import { AppCtx } from "../../../appCtx.js"
import { createCallId, ellipsis40, errorDetails, errorStorageDetails, logDebugJson, logLine } from "../../../logging/index.js"
import { AbstractMagicApi } from "../../../magic/api.js"
import { GenerationOrderRecord } from "../../../type/order.js"
import { EventDispatcher } from "../eventDispatcher.js"
import { LLMRuntimeConfigCache } from "../runtimeConfigCache.js"
import { parseFiletypeOperators } from "../../search/queryOperators.js"

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

export function createSearchGenerateHandler(args: {
  appCtx: AppCtx
  eventDispatcher: EventDispatcher
  runtimeConfigCache: LLMRuntimeConfigCache
  magicApi: AbstractMagicApi
}): (order: GenerationOrderRecord) => Promise<void> {
  const searchDB = args.appCtx.dbClients.search()
  const configDB = args.appCtx.dbClients.config()
  const llmDB = args.appCtx.dbClients.llm()

  const callWithRetry = async <T>(callArgs: {
    trigger: "intent-generation" | "article-generation"
    query: string
    intent?: string
    queryId: number
    intentId?: number
    orderId: number
    run: () => Promise<T>
  }): Promise<{ result: T; attempt: number; durationMs: number }> => {
    const runtimeConfig = args.runtimeConfigCache.get()
    let lastError: unknown = null
    let attemptsMade = 0
    let lastDurationMs = 0

    for (let attempt = 1; attempt <= runtimeConfig.llmRetryMaxAttempts; attempt += 1) {
      const callId = createCallId()
      attemptsMade = attempt
      const startMs = Date.now()
      try {
        const result = await withTimeout(callArgs.run, runtimeConfig.llmRequestTimeoutMs)
        const durationMs = Date.now() - startMs
        lastDurationMs = durationMs
        logLine(
          "info",
          `LLM search ${callArgs.trigger} query="${ellipsis40(callArgs.query)}"${callArgs.intent ? ` intent="${ellipsis40(callArgs.intent)}"` : ""} provider=${args.magicApi.providerName({})} ok ${durationMs}ms attempt=${attempt} cid=${callId}`
        )
        logDebugJson(args.appCtx.config.app.debug, {
          event: "llm.call",
          provider: args.magicApi.providerName({}),
          operation: `magic.${callArgs.trigger}`,
          component: "search",
          trigger: callArgs.trigger,
          query: callArgs.query.trim(),
          intent: callArgs.intent?.trim(),
          status: "ok",
          durationMs,
          attempt,
          timeoutMs: runtimeConfig.llmRequestTimeoutMs,
          callId,
        })
        return { result, attempt, durationMs }
      } catch (error) {
        lastError = error
        const durationMs = Date.now() - startMs
        lastDurationMs = durationMs
        const details = errorDetails(error)
        const storedDetails = errorStorageDetails(error)
        const isTimeout = details.errorMessage.includes("timed out")
        if (isTimeout) {
          const llmDetails = (storedDetails.llmDetails as Record<string, unknown> | undefined) || {}
          if (!llmDetails.requestBody) {
            llmDetails.requestBody = {
              model:
                callArgs.trigger === "intent-generation"
                  ? configDB.getValue("search.intent_resolve.model")
                  : configDB.getValue("search.content_generation.model"),
              stream: false,
              input: {
                query: callArgs.query,
                intent: callArgs.intent ?? null,
              },
              note: "timeout captured before provider response; this is a reconstructed request snapshot",
            }
          }
          storedDetails.llmDetails = llmDetails
        }
        llmDB.createFailure({
          provider: args.magicApi.providerName({}),
          component: "search.worker",
          trigger: callArgs.trigger,
          model:
            callArgs.trigger === "intent-generation"
              ? configDB.getValue("search.intent_resolve.model")
              : configDB.getValue("search.content_generation.model"),
          queryId: callArgs.queryId,
          intentId: callArgs.intentId,
          orderId: callArgs.orderId,
          queryText: callArgs.query,
          intentText: callArgs.intent,
          callId,
          attempt,
          durationMs,
          errorName: details.errorName,
          errorMessage: details.errorMessage,
          details: storedDetails,
        })
        logLine(
          "error",
          `LLM search ${callArgs.trigger} query="${ellipsis40(callArgs.query)}"${callArgs.intent ? ` intent="${ellipsis40(callArgs.intent)}"` : ""} provider=${args.magicApi.providerName({})} error ${durationMs}ms attempt=${attempt} cid=${callId} msg="${details.errorMessage}"`
        )
        logDebugJson(args.appCtx.config.app.debug, {
          level: "error",
          event: "llm.call",
          provider: args.magicApi.providerName({}),
          operation: `magic.${callArgs.trigger}`,
          component: "search",
          trigger: callArgs.trigger,
          query: callArgs.query.trim(),
          intent: callArgs.intent?.trim(),
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
    const wrapped = lastError instanceof Error ? lastError : new Error("Search generation failed")
    ;(wrapped as Error & { llmAttempts?: number; llmDurationMs?: number }).llmAttempts = attemptsMade
    ;(wrapped as Error & { llmDurationMs?: number }).llmDurationMs = lastDurationMs
    throw wrapped
  }

  return async (order) => {
    const query = searchDB.getQueryById(order.queryId)
    if (!query) {
      throw new Error("Query not found")
    }
    const parsedQuery = parseFiletypeOperators(query.value)
    const cleanQuery = parsedQuery.cleanQuery || query.value.trim()
    const queryFiletype = parsedQuery.filetype || "md"

    if (order.kind === "query_full") {
      const queryLock = searchDB.tryAcquireLock({
        orderId: order.id,
        scopeType: "query",
        scopeKey: `query:${order.queryId}`,
        leaseSeconds: 60,
      })
      if (!queryLock.ok) {
        throw new Error(`Resource locked by order ${queryLock.ownerOrderId}`)
      }
    }

    const payload = (() => {
      try {
        return JSON.parse(order.requestPayloadJson || "{}") as { keepTitle?: boolean }
      } catch {
        return {}
      }
    })()

    args.eventDispatcher.emit({
      orderId: order.id,
      event: {
        type: "order.started",
        orderId: order.id,
        queryId: order.queryId,
        kind: order.kind,
        intentId: order.intentId ?? undefined,
      },
    })

    searchDB.appendGenerationLog({
      orderId: order.id,
      stage: "order",
      level: "info",
      message: "Order started",
      meta: { kind: order.kind, queryId: order.queryId, intentId: order.intentId },
    })

    try {
      let intentRecords: Array<{ id: number; intent: string; filetype: string }> = []

      if (order.kind === "query_full") {
        searchDB.clearQueryIntentLinks(order.queryId)
        args.eventDispatcher.emit({
          orderId: order.id,
          event: {
            type: "order.progress",
            orderId: order.id,
            queryId: order.queryId,
            stage: "intent",
            message: "Resolving intents",
          },
        })

        const intentResult = await callWithRetry({
          trigger: "intent-generation",
          query: cleanQuery,
          queryId: order.queryId,
          orderId: order.id,
          run: () =>
            args.magicApi.resolveIntent({
              query: cleanQuery,
              language: query.language,
              filetype: queryFiletype,
            }),
        })

        const intents = intentResult.result.intents.length > 0 ? intentResult.result.intents : [cleanQuery]
        intentRecords = intents.map((intentCandidate) => {
          const intent = searchDB.upsertIntent(order.queryId, intentCandidate, queryFiletype)
          args.eventDispatcher.emit({
            orderId: order.id,
            event: {
              type: "intent.upserted",
              orderId: order.id,
              queryId: order.queryId,
              intent: {
                id: intent.id,
                value: intent.intent,
              },
            },
          })
          return { id: intent.id, intent: intent.intent, filetype: intent.filetype }
        })
      } else if (order.intentId) {
        const found = searchDB.listIntentsByQueryId(order.queryId).find((item) => item.id === order.intentId)
        if (!found) {
          throw new Error("Target intent not found for query")
        }
        intentRecords = [{ id: found.id, intent: found.intent, filetype: found.filetype }]
      } else {
        throw new Error("intent_id is required for this order kind")
      }

      for (const intentRecord of intentRecords) {
        const intentLock = searchDB.tryAcquireLock({
          orderId: order.id,
          scopeType: "intent",
          scopeKey: `intent:${order.queryId}:${intentRecord.id}`,
          leaseSeconds: 60,
        })
        if (!intentLock.ok) {
          throw new Error(`Intent locked by order ${intentLock.ownerOrderId}`)
        }

        args.eventDispatcher.emit({
          orderId: order.id,
          event: {
            type: "order.progress",
            orderId: order.id,
            queryId: order.queryId,
            stage: "article",
            message: `Generating article for intent ${intentRecord.id}`,
          },
        })

        const runId = searchDB.createArticleGenerationRun({
          queryId: order.queryId,
          intentId: intentRecord.id,
          orderId: order.id,
        })
        const articleStartMs = Date.now()
        let article: ReturnType<typeof searchDB.createArticle> | null = null
        let llmAttempt = 0
        let llmDurationMs = 0

        try {
          const articleResult = await callWithRetry({
            trigger: "article-generation",
            query: cleanQuery,
            intent: intentRecord.intent,
            queryId: order.queryId,
            intentId: intentRecord.id,
            orderId: order.id,
            run: () =>
              args.magicApi.createArticle({
                query: cleanQuery,
                intent: intentRecord.intent,
                language: query.language,
                filetype: intentRecord.filetype,
              }),
          })
          llmAttempt = articleResult.attempt
          llmDurationMs = articleResult.durationMs

          const shouldKeepTitle = order.kind === "article_regen_keep_title" || payload.keepTitle === true
          article = searchDB.createArticle({
            intentId: intentRecord.id,
            title: articleResult.result.article.title,
            slug: articleResult.result.article.slug,
            filetype: intentRecord.filetype,
            content: articleResult.result.article.content,
            generatedBy: articleResult.result.article.generatedBy,
            replaceExistingForIntent: order.kind !== "query_full",
            keepTitleWhenReplacing: shouldKeepTitle,
          })

          searchDB.completeArticleGenerationRun({
            runId,
            articleId: article.id,
            attempts: llmAttempt,
            durationMs: Date.now() - articleStartMs,
            llmDurationMs,
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Article generation failed"
          const attempts = (error as { llmAttempts?: number } | null)?.llmAttempts ?? Math.max(1, llmAttempt)
          const lastLlmDurationMs = (error as { llmDurationMs?: number } | null)?.llmDurationMs ?? llmDurationMs
          searchDB.failArticleGenerationRun({
            runId,
            attempts,
            durationMs: Date.now() - articleStartMs,
            llmDurationMs: lastLlmDurationMs || null,
            errorMessage,
          })
          throw error
        }
        if (!article) {
          throw new Error("Article creation did not produce a record")
        }

        const queryResult = searchDB.getQueryResult(order.queryId)
        const snippet = queryResult?.intents
          .find((intent) => intent.id === intentRecord.id)
          ?.articles.find((candidate) => candidate.id === article.id)
          ?.snippet || ""

        args.eventDispatcher.emit({
          orderId: order.id,
          event: {
            type: "article.upserted",
            orderId: order.id,
            queryId: order.queryId,
            intentId: intentRecord.id,
            article: {
              id: article.id,
              title: article.title,
              slug: article.slug,
              snippet,
            },
          },
        })
      }

      args.eventDispatcher.emit({
        orderId: order.id,
        event: {
          type: "order.completed",
          orderId: order.id,
          queryId: order.queryId,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Order fulfillment failed"
      args.eventDispatcher.emit({
        orderId: order.id,
        event: {
          type: "order.failed",
          orderId: order.id,
          queryId: order.queryId,
          message,
        },
      })
      throw error
    } finally {
      searchDB.releaseOrderLocks(order.id)
    }
  }
}
