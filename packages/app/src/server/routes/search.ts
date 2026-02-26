import { Router } from "express"
import { AppCtx } from "../../appCtx.js"
import { SearchStreamEvent, SearchSuggestionsPayload } from "../../type/search.js"
import { logDebugJson, logLine, createCallId, ellipsis40, errorDetails } from "../../logging/index.js"
import { EventDispatcher } from "../llm/eventDispatcher.js"
import { AbstractMagicApi } from "../../magic/api.js"

function parseQueryId(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

function normalizeLanguageCode(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.toLowerCase() === "auto") return null
  if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(trimmed)) return null

  try {
    const [canonical] = Intl.getCanonicalLocales(trimmed)
    return canonical || trimmed
  } catch {
    return trimmed
  }
}

type SpellCorrectionMode = "off" | "auto" | "force"

function parseSpellCorrectionMode(value: unknown, fallback: SpellCorrectionMode): SpellCorrectionMode {
  if (typeof value !== "string") return fallback
  if (value === "off" || value === "auto" || value === "force") return value
  return fallback
}

function normalizeForDiff(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, "")
    .replace(/\s+/g, " ")
}

function isMeaningfullyDifferent(original: string, corrected: string): boolean {
  if (!corrected.trim()) return false
  return normalizeForDiff(original) !== normalizeForDiff(corrected)
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

function parsePositiveIntOrDefault(input: string | null, defaultValue: number): number {
  if (!input) return defaultValue
  const parsed = Number.parseInt(input, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue
}

function parseStringArrayOrFallback(rawValue: string | null, fallback: string[]): string[] {
  if (!rawValue) return fallback
  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!Array.isArray(parsed)) return fallback
    const values = parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
    return values.length > 0 ? values : fallback
  } catch {
    return fallback
  }
}

const fallbackExampleQueries = [
  "sqlite fts5 bm25",
  "rag architecture",
  "node express memory leak",
  "typescript api error handling",
  "self hosted vector database",
  "llm system prompt template",
]

function parseExampleQueries(rawValue: string | null): string[] {
  if (!rawValue) return fallbackExampleQueries

  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!Array.isArray(parsed)) return fallbackExampleQueries

    const values = parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)

    return values.length > 0 ? values : fallbackExampleQueries
  } catch {
    return fallbackExampleQueries
  }
}

function getExampleQueryConfigKeys(language: string | null): string[] {
  if (!language) return ["search.example_queries"]

  const normalized = language.trim().toLowerCase()
  if (!normalized) return ["search.example_queries"]

  const keys: string[] = [`search.example_queries.${normalized}`]
  const base = normalized.split("-")[0]
  if (base && base !== normalized) {
    keys.push(`search.example_queries.${base}`)
  }

  if (normalized === "zh-hk") {
    keys.push("search.example_queries.zh-tw")
  }

  keys.push("search.example_queries")
  return [...new Set(keys)]
}

function resolveExampleQueriesForLanguage(configDB: { getValue: (key: string) => string | null }, language: string | null): string[] {
  for (const key of getExampleQueryConfigKeys(language)) {
    const value = configDB.getValue(key)
    if (!value) continue
    const parsed = parseExampleQueries(value)
    if (parsed.length > 0) return parsed
  }
  return fallbackExampleQueries
}

const fallbackRecentBlacklistTerms = ["test", "testing", "asdf", "qwer", "zxcv", "1234"]

function shouldTrackRecentQuery(args: {
  query: string
  minChars: number
  blacklistTerms: string[]
}): boolean {
  const normalized = args.query.trim().toLowerCase()
  if (!normalized) return false
  if (normalized.length < args.minChars) return false
  if (args.blacklistTerms.includes(normalized)) return false
  // filter obvious keyboard-smash style noise like "aaaa" / "1111"
  if (/^([a-z0-9])\1{2,}$/i.test(normalized)) return false
  return true
}

export function createSearchRouter(ctx: AppCtx, eventDispatcher: EventDispatcher, magicApi: AbstractMagicApi) {
  const router = Router()
  const searchDB = ctx.dbClients.search()
  const llmDB = ctx.dbClients.llm()
  const configDB = ctx.dbClients.config()

  const callMagicWithRetry = async <T>(args: {
    trigger: "spelling-correction"
    query: string
    run: () => Promise<T>
  }): Promise<T> => {
    const retryMaxAttempts = parsePositiveIntOrDefault(configDB.getValue("llm.retry.max_attempts"), 2)
    const timeoutMs = parsePositiveIntOrDefault(configDB.getValue("llm.retry.timeout_ms"), 20000)
    let lastError: unknown = null

    for (let attempt = 1; attempt <= retryMaxAttempts; attempt += 1) {
      const callId = createCallId()
      const startMs = Date.now()
      try {
        const result = await withTimeout(args.run, timeoutMs)
        const durationMs = Date.now() - startMs
        logLine(
          "info",
          `LLM search ${args.trigger} query="${ellipsis40(args.query)}" provider=${magicApi.providerName({})} ok ${durationMs}ms attempt=${attempt} cid=${callId}`
        )
        logDebugJson(ctx.config.app.debug, {
          event: "llm.call",
          provider: magicApi.providerName({}),
          operation: `magic.${args.trigger}`,
          component: "search",
          trigger: args.trigger,
          query: args.query.trim(),
          status: "ok",
          durationMs,
          attempt,
          timeoutMs,
          callId,
        })
        return result
      } catch (error) {
        lastError = error
        const durationMs = Date.now() - startMs
        const details = errorDetails(error)
        logLine(
          "error",
          `LLM search ${args.trigger} query="${ellipsis40(args.query)}" provider=${magicApi.providerName({})} error ${durationMs}ms attempt=${attempt} cid=${callId} msg="${details.errorMessage}"`
        )
        logDebugJson(ctx.config.app.debug, {
          level: "error",
          event: "llm.call",
          provider: magicApi.providerName({}),
          operation: `magic.${args.trigger}`,
          component: "search",
          trigger: args.trigger,
          query: args.query.trim(),
          status: "error",
          durationMs,
          attempt,
          timeoutMs,
          callId,
          errorName: details.errorName,
          errorMessage: details.errorMessage,
        })
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Spell correction failed")
  }

  router.post("/query", async (req, res) => {
    const originalQueryValue = typeof req.body?.query === "string" ? req.body.query.trim() : ""
    if (!originalQueryValue) {
      res.status(400).json({ error: "query is required" })
      return
    }

    const language = normalizeLanguageCode(req.body?.language)
    if (!language) {
      res.status(400).json({ error: "language is required and must be a valid language code (not 'auto')" })
      return
    }

    const spellModeDefault = parseSpellCorrectionMode(
      configDB.getValue("search.spell_correction_mode"),
      "auto"
    )
    const spellCorrectionMode = parseSpellCorrectionMode(req.body?.spellCorrectionMode, spellModeDefault)

    try {
      let correctedCandidate = ""
      if (spellCorrectionMode !== "off") {
        const cached = searchDB.getSpellCorrection({
          sourceText: originalQueryValue,
          language,
          provider: magicApi.providerName({}),
        })

        if (cached?.correctedText) {
          correctedCandidate = cached.correctedText
        } else {
          const correction = await callMagicWithRetry({
            trigger: "spelling-correction",
            query: originalQueryValue,
            run: () =>
              magicApi.correctSpelling({
                text: originalQueryValue,
                language,
              }),
          })

          correctedCandidate = correction.text.trim()
          if (correctedCandidate) {
            searchDB.upsertSpellCorrection({
              sourceText: originalQueryValue,
              language,
              provider: magicApi.providerName({}),
              correctedText: correctedCandidate,
            })
          }
        }
      }

      const shouldApplyCorrection =
        spellCorrectionMode === "force"
          ? Boolean(correctedCandidate.trim())
          : spellCorrectionMode === "auto"
            ? isMeaningfullyDifferent(originalQueryValue, correctedCandidate)
            : false

      const effectiveQuery = shouldApplyCorrection && correctedCandidate.trim()
        ? correctedCandidate.trim()
        : originalQueryValue

      const query = searchDB.upsertQuery({
        value: effectiveQuery,
        language,
        originalValue: originalQueryValue,
      })

      const recentMinChars = parsePositiveIntOrDefault(configDB.getValue("search.recent.min_query_chars"), 3)
      const recentDedupeWindowSeconds = parsePositiveIntOrDefault(
        configDB.getValue("search.recent.dedupe_window_seconds"),
        300
      )
      const recentBlacklistTerms = parseStringArrayOrFallback(
        configDB.getValue("search.recent.blacklist_terms"),
        fallbackRecentBlacklistTerms
      )

      if (
        shouldTrackRecentQuery({
          query: effectiveQuery,
          minChars: recentMinChars,
          blacklistTerms: recentBlacklistTerms,
        })
      ) {
        searchDB.createQueryHistory({
          queryText: effectiveQuery,
          language,
          queryId: query.id,
          dedupeWindowSeconds: recentDedupeWindowSeconds,
        })
      }

      res.json({
        queryId: query.id,
        query: query.value,
        originalQuery: originalQueryValue,
        correctionApplied: shouldApplyCorrection,
        correctedQuery: shouldApplyCorrection ? effectiveQuery : null,
        language,
        spellCorrectionMode,
      })
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to create query",
      })
    }
  })

  router.get("/search/suggestions", (req, res) => {
    const requestedLanguage =
      typeof req.query.language === "string"
        ? normalizeLanguageCode(req.query.language)
        : null
    const recentLimitRaw = typeof req.query.recentLimit === "string" ? req.query.recentLimit : null
    const recentLimit = parsePositiveIntOrDefault(recentLimitRaw, 8)
    const recent = searchDB.listRecentQueries({
      limit: Math.min(recentLimit, 20),
      language: requestedLanguage,
    })
    const examples = resolveExampleQueriesForLanguage(configDB, requestedLanguage)
    const payload: SearchSuggestionsPayload = {
      examples,
      recent,
      isFirstTimeUser: searchDB.getQueryHistoryCount() === 0,
    }
    res.json(payload)
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
