import { AppCtx } from "../../../appCtx.js"
import { createSearchLLM } from "../../../llm/search.js"
import { SearchGenerateJobPayload } from "../../../type/llm.js"
import { EventDispatcher } from "../eventDispatcher.js"

function parsePositiveIntOrDefault(value: string | null, defaultValue: number): number {
  if (!value) return defaultValue
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue
}

export function createSearchGenerateHandler(args: {
  appCtx: AppCtx
  eventDispatcher: EventDispatcher
}): (payload: SearchGenerateJobPayload) => Promise<void> {
  const searchDB = args.appCtx.dbClients.search()
  const configDB = args.appCtx.dbClients.config()
  const searchLLM = createSearchLLM(args.appCtx.config.api.apiKey, {
    intentModel: configDB.getValue("search.intent_model") || "gpt-5-mini",
    articleModel: configDB.getValue("search.article_model") || "gpt-5.2-chat-latest",
    retryMaxAttempts: parsePositiveIntOrDefault(configDB.getValue("llm.retry.max_attempts"), 2),
    requestTimeoutMs: parsePositiveIntOrDefault(configDB.getValue("llm.retry.timeout_ms"), 20000),
    debug: args.appCtx.config.app.debug,
  })

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
      const intentResult = await searchLLM.getIntent(payload.queryValue)
      const intents = intentResult.intents.length > 0
        ? intentResult.intents
        : [{ value: payload.queryValue }]

      intentRecords = intents.map((intentCandidate) => {
        const intent = searchDB.upsertIntent(payload.queryId, intentCandidate.value)
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

      const articleResult = await searchLLM.createArticle({
        query: payload.queryValue,
        intent: intentRecord.intent,
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
