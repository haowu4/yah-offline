import { AppCtx } from "../../../appCtx.js"
import { createCallId, ellipsis40, errorDetails, logDebugJson, logLine } from "../../../logging/index.js"
import { AbstractMagicApi } from "../../../magic/api.js"
import { SearchGenerateJobPayload } from "../../../type/llm.js"
import { EventDispatcher } from "../eventDispatcher.js"
import { LLMRuntimeConfigCache } from "../runtimeConfigCache.js"

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
}): (payload: SearchGenerateJobPayload) => Promise<void> {
  const searchDB = args.appCtx.dbClients.search()

  const callWithRetry = async <T>(callArgs: {
    trigger: "intent-generation" | "article-generation"
    query: string
    intent?: string
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
        return result
      } catch (error) {
        lastError = error
        const durationMs = Date.now() - startMs
        const details = errorDetails(error)
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

    throw lastError instanceof Error ? lastError : new Error("Search generation failed")
  }

  return async (payload) => {
    const query = searchDB.getQueryById(payload.queryId)
    if (!query) {
      throw new Error("Query not found")
    }

    const entityId = `query:${payload.queryId}`
    const existing = searchDB.getQueryResult(payload.queryId)
    let intentRecords: Array<{ id: number; intent: string }>

    if (existing && existing.intents.length > 0) {
      intentRecords = existing.intents.map((intent) => ({
        id: intent.id,
        intent: intent.intent,
      }))
    } else {
      const intentResult = await callWithRetry({
        trigger: "intent-generation",
        query: payload.queryValue,
        run: () =>
          args.magicApi.resolveIntent({
            query: payload.queryValue,
          }),
      })
      const intents = intentResult.intents.length > 0
        ? intentResult.intents
        : [payload.queryValue]

      intentRecords = intents.map((intentCandidate) => {
        const intent = searchDB.upsertIntent(payload.queryId, intentCandidate)
        args.eventDispatcher.emit({
          topic: "search.query",
          entityId,
          event: {
            type: "intent.created",
            queryId: payload.queryId,
            intent: {
              id: intent.id,
              value: intent.intent,
            },
          },
        })
        return {
          id: intent.id,
          intent: intent.intent,
        }
      })
    }

    for (const intentRecord of intentRecords) {
      const latest = searchDB.getQueryResult(payload.queryId)
      const latestIntent = latest?.intents.find((intent) => intent.id === intentRecord.id)
      const existingArticle = latestIntent?.articles[0]
      if (existingArticle) continue

      const articleResult = await callWithRetry({
        trigger: "article-generation",
        query: payload.queryValue,
        intent: intentRecord.intent,
        run: () =>
          args.magicApi.createArticle({
            query: payload.queryValue,
            intent: intentRecord.intent,
          }),
      })

      const article = searchDB.createArticle({
        intentId: intentRecord.id,
        title: articleResult.article.title,
        slug: articleResult.article.slug,
        content: articleResult.article.content,
      })

      const queryResult = searchDB.getQueryResult(payload.queryId)
      const snippet = queryResult?.intents
        .find((intent) => intent.id === intentRecord.id)
        ?.articles.find((candidate) => candidate.id === article.id)
        ?.snippet || ""

      args.eventDispatcher.emit({
        topic: "search.query",
        entityId,
        event: {
          type: "article.created",
          queryId: payload.queryId,
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
      topic: "search.query",
      entityId,
      event: {
        type: "query.completed",
        queryId: payload.queryId,
        replayed: Boolean(existing && existing.intents.length > 0),
      },
    })
  }
}
