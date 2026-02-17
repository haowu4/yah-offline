import { Router } from "express"
import { AppCtx } from "../../appCtx.js"
import { createSearchLLM } from "../../llm/search.js"
import { SearchStreamEvent } from "../../type/search.js"

function parseQueryId(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^\s*>\s?/gm, "")
}

function toSnippet(content: string): string {
  const plainText = toPlainText(content)
  const collapsed = plainText.replace(/\s+/g, " ").trim()
  if (collapsed.length <= 360) return collapsed
  return `${collapsed.slice(0, 357)}...`
}

export function createSearchRouter(ctx: AppCtx) {
  const router = Router()
  const searchDB = ctx.dbClients.search()
  const searchLLM = createSearchLLM(ctx.config.api.apiKey)

  router.post("/query", (req, res) => {
    const queryValue = typeof req.body?.query === "string" ? req.body.query.trim() : ""
    if (!queryValue) {
      res.status(400).json({ error: "query is required" })
      return
    }

    const query = searchDB.upsertQuery(queryValue)
    res.json({
      queryId: query.id
    })
  })


  router.get("/query/:query_id/stream", async (req, res) => {
    const queryId = parseQueryId(req.params.query_id)
    if (!queryId) {
      res.status(400).json({ error: "Invalid query_id" })
      return
    }

    const query = searchDB.getQueryById(queryId)
    if (!query) {
      res.status(404).json({ error: "query not found" })
      return
    }

    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    let isClosed = false
    req.on("close", () => {
      isClosed = true
    })

    const sendEvent = (event: SearchStreamEvent) => {
      if (isClosed) return
      res.write(`event: ${event.type}\n`)
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    const finish = () => {
      if (isClosed) return
      res.end()
    }

    try {
      const existing = searchDB.getQueryResult(queryId)
      if (existing && existing.intents.length > 0) {
        for (const intent of existing.intents) {
          sendEvent({
            type: "intent.created",
            queryId,
            intent: {
              id: intent.id,
              value: intent.intent,
            },
          })

          for (const article of intent.articles) {
            sendEvent({
              type: "article.created",
              queryId,
              intentId: intent.id,
              article: {
                id: article.id,
                title: article.title,
                slug: article.slug,
                snippet: article.snippet,
              },
            })
          }
        }

        sendEvent({
          type: "query.completed",
          queryId,
          replayed: true,
        })
        finish()
        return
      }

      const intentResult = await searchLLM.getIntent(query.value)
      const intents = intentResult.intents.length > 0
        ? intentResult.intents
        : [{ value: query.value }]

      const intentRecords = intents.map((intentCandidate) => searchDB.upsertIntent(queryId, intentCandidate.value))

      for (const intentRecord of intentRecords) {
        if (isClosed) return
        sendEvent({
          type: "intent.created",
          queryId,
          intent: {
            id: intentRecord.id,
            value: intentRecord.intent,
          },
        })
      }

      for (const intentRecord of intentRecords) {
        if (isClosed) return
        const articleResult = await searchLLM.createArticle({
          query: query.value,
          intent: intentRecord.intent,
        })
        const generatedArticle = articleResult.article

        const articleRecord = searchDB.createArticle({
          intentId: intentRecord.id,
          title: generatedArticle.title,
          slug: generatedArticle.slug,
          content: generatedArticle.content,
        })
        sendEvent({
          type: "article.created",
          queryId,
          intentId: intentRecord.id,
          article: {
            id: articleRecord.id,
            title: articleRecord.title,
            slug: articleRecord.slug,
            snippet: toSnippet(articleRecord.content),
          },
        })
      }

      sendEvent({
        type: "query.completed",
        queryId,
        replayed: false,
      })
      finish()
    } catch (error) {
      sendEvent({
        type: "query.error",
        queryId,
        message: error instanceof Error ? error.message : "Unknown error",
      })
      finish()
    }
  })

  router.get("/article", (req, res) => {
    const queryIdRaw = typeof req.query.queryId === "string" ? req.query.queryId : ""
    const queryId = parseQueryId(queryIdRaw)
    if (!queryId) {
      res.status(400).json({ error: "queryId is required" })
      return
    }

    const payload = searchDB.getQueryResult(queryId)
    if (!payload) {
      res.status(404).json({ error: "query not found" })
      return
    }

    res.json(payload)
  })

  router.get("/article/:slug", (req, res) => {
    const slug = req.params.slug?.trim()
    if (!slug) {
      res.status(400).json({ error: "slug is required" })
      return
    }

    const payload = searchDB.getArticleDetailBySlug(slug)
    if (!payload) {
      res.status(404).json({ error: "article not found" })
      return
    }

    res.json(payload)
  })



  return router
}
