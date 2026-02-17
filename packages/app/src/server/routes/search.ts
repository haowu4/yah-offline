import { Router } from "express"
import { AppCtx } from "../../appCtx.js"
import { createSearchLLM } from "../../llm/search.js"
import { SearchStreamEvent } from "../../type/search.js"

const queryGenerationTasks = new Map<number, Promise<void>>()

function parseQueryId(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function createSearchRouter(ctx: AppCtx) {
  const router = Router()
  const searchDB = ctx.dbClients.search()
  const searchLLM = createSearchLLM(ctx.config.api.apiKey)

  function ensureQueryGeneration(queryId: number, run: () => Promise<void>): Promise<void> {
    const existingTask = queryGenerationTasks.get(queryId)
    if (existingTask) return existingTask

    const task = run().finally(() => {
      const current = queryGenerationTasks.get(queryId)
      if (current === task) {
        queryGenerationTasks.delete(queryId)
      }
    })
    queryGenerationTasks.set(queryId, task)
    return task
  }

  async function generateMissingContent(args: { queryId: number; queryValue: string }): Promise<void> {
    const existing = searchDB.getQueryResult(args.queryId)
    let intentRecords: Array<{ id: number; intent: string }>

    if (existing && existing.intents.length > 0) {
      intentRecords = existing.intents.map((intent) => ({
        id: intent.id,
        intent: intent.intent,
      }))
    } else {
      const intentResult = await searchLLM.getIntent(args.queryValue)
      const intents = intentResult.intents.length > 0
        ? intentResult.intents
        : [{ value: args.queryValue }]
      intentRecords = intents.map((intentCandidate) =>
        searchDB.upsertIntent(args.queryId, intentCandidate.value)
      )
    }

    for (const intentRecord of intentRecords) {
      const latest = searchDB.getQueryResult(args.queryId)
      const latestIntent = latest?.intents.find((intent) => intent.id === intentRecord.id)
      const existingArticle = latestIntent?.articles[0]
      if (existingArticle) {
        continue
      }

      const articleResult = await searchLLM.createArticle({
        query: args.queryValue,
        intent: intentRecord.intent,
      })
      const generatedArticle = articleResult.article

      searchDB.createArticle({
        intentId: intentRecord.id,
        title: generatedArticle.title,
        slug: generatedArticle.slug,
        content: generatedArticle.content,
      })
    }
  }

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
      const replayed = Boolean(existing && existing.intents.length > 0)
      const emittedIntentIds = new Set<number>()
      const emittedArticleIds = new Set<number>()
      const emitSnapshot = () => {
        const snapshot = searchDB.getQueryResult(queryId)
        if (!snapshot) return

        for (const intent of snapshot.intents) {
          if (!emittedIntentIds.has(intent.id)) {
            emittedIntentIds.add(intent.id)
            sendEvent({
              type: "intent.created",
              queryId,
              intent: {
                id: intent.id,
                value: intent.intent,
              },
            })
          }

          for (const article of intent.articles) {
            if (emittedArticleIds.has(article.id)) continue
            emittedArticleIds.add(article.id)
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
      }

      const generationTask = ensureQueryGeneration(queryId, () =>
        generateMissingContent({
          queryId,
          queryValue: query.value,
        })
      )

      while (!isClosed) {
        emitSnapshot()
        if (!queryGenerationTasks.has(queryId)) {
          break
        }
        await wait(200)
      }

      if (isClosed) return

      await generationTask
      emitSnapshot()

      sendEvent({
        type: "query.completed",
        queryId,
        replayed,
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
