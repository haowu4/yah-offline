import { Router } from "express"
import { AppCtx } from "../../appCtx.js"
import { SearchStreamEvent } from "../../type/search.js"
import { logDebugJson, logLine } from "../../logging/index.js"
import { EventDispatcher } from "../llm/eventDispatcher.js"

function parseQueryId(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

export function createSearchRouter(ctx: AppCtx, eventDispatcher: EventDispatcher) {
  const router = Router()
  const searchDB = ctx.dbClients.search()
  const llmDB = ctx.dbClients.llm()

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

  router.get("/query/:query_id/stream", (req, res) => {
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
    const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : "-"
    const streamPath = req.originalUrl || req.url || req.path
    logLine("info", `SSE IN  ${streamPath} query_id=${queryId} rid=${requestId}`)
    logDebugJson(ctx.config.app.debug, {
      event: "http.sse.in",
      requestId,
      path: streamPath,
      queryId,
    })

    const finish = () => {
      if (isClosed) return
      isClosed = true
      logLine("info", `SSE OUT ${streamPath} query_id=${queryId} rid=${requestId}`)
      logDebugJson(ctx.config.app.debug, {
        event: "http.sse.out",
        requestId,
        path: streamPath,
        queryId,
      })
      res.end()
    }

    req.on("close", finish)

    const sendEvent = (id: number, event: SearchStreamEvent) => {
      if (isClosed) return
      res.write(`id: ${id}\n`)
      res.write(`event: ${event.type}\n`)
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    const isTerminalEvent = (event: SearchStreamEvent): boolean =>
      event.type === "query.completed" || event.type === "query.error"

    const lastEventIdRaw = req.header("Last-Event-ID") || req.query.lastEventId
    const lastEventId =
      typeof lastEventIdRaw === "string" ? Number.parseInt(lastEventIdRaw, 10) : 0

    const entityId = `query:${queryId}`
    const replayEvents = Number.isInteger(lastEventId) && lastEventId >= 0
      ? eventDispatcher.replayAfter({
          topic: "search.query",
          entityId,
          lastEventId: Math.max(0, lastEventId),
        })
      : []

    let replayEnded = false
    for (const item of replayEvents) {
      sendEvent(item.id, item.event)
      if (isTerminalEvent(item.event)) {
        replayEnded = true
      }
    }

    if (replayEnded) {
      finish()
      return
    }

    const hasGeneratedContent = searchDB.hasGeneratedContent(queryId)
    const hasActiveJob = llmDB.hasActiveJob("search.generate", entityId)

    if (!hasGeneratedContent && !hasActiveJob) {
      llmDB.enqueueJob({
        kind: "search.generate",
        entityId,
        priority: 10,
        payload: {
          queryId,
          queryValue: query.value,
        },
      })
    }

    if (hasGeneratedContent && !hasActiveJob && replayEvents.length === 0) {
      sendEvent(0, {
        type: "query.completed",
        queryId,
        replayed: true,
      })
      finish()
      return
    }

    const unsubscribe = eventDispatcher.subscribe({
      topic: "search.query",
      entityId,
      send: ({ id, event }) => {
        sendEvent(id, event)
        if (isTerminalEvent(event)) {
          unsubscribe()
          clearInterval(heartbeat)
          finish()
        }
      },
    })

    const heartbeat = setInterval(() => {
      if (!isClosed) {
        res.write(": ping\n\n")
      }
    }, 15000)

    req.on("close", () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
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
