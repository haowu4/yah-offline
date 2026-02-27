import { Router } from "express"
import { AppCtx } from "../../appCtx.js"
import { SearchSuggestionsPayload } from "../../type/search.js"
import { logDebugJson, logLine, createCallId, ellipsis40, errorDetails, errorStorageDetails } from "../../logging/index.js"
import { EventDispatcher } from "../llm/eventDispatcher.js"
import { AbstractMagicApi } from "../../magic/api.js"
import { GenerationOrderEvent, GenerationOrderKind, GenerationOrderRecord } from "../../type/order.js"

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

function normalizeCompact(value: string): string {
  return normalizeForDiff(value).replace(/\s+/g, "")
}

function isMeaningfullyDifferent(original: string, corrected: string): boolean {
  if (!corrected.trim()) return false
  const normalizedOriginal = normalizeForDiff(original)
  const normalizedCorrected = normalizeForDiff(corrected)
  if (normalizedOriginal === normalizedCorrected) return false
  if (normalizeCompact(original) === normalizeCompact(corrected)) return false
  return true
}

function isPlausibleCorrection(original: string, corrected: string): boolean {
  const source = original.trim()
  const candidate = corrected.trim()
  if (!source || !candidate) return false
  if (/[\r\n]/.test(candidate)) return false

  const sourceCompact = normalizeCompact(source)
  const candidateCompact = normalizeCompact(candidate)
  if (!candidateCompact) return false

  const maxLen = Math.max(96, source.length * 3 + 16)
  const maxCompactLen = Math.max(96, sourceCompact.length * 3 + 16)
  if (candidate.length > maxLen) return false
  if (candidateCompact.length > maxCompactLen) return false

  if (source.length <= 64 && /[.!?。！？]/.test(candidate) && candidate.length > source.length + 20) {
    return false
  }

  return true
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
  "laplace transform table",
  "schrodinger equation intuition",
  "database indexing strategy",
  "sqlite fts5 bm25",
  "ubuntu install ohmyzsh",
  "rag chunking strategy",
  "causes of world war i",
  "insulin resistance basics",
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
  if (/^([a-z0-9])\1{2,}$/i.test(normalized)) return false
  return true
}

function parseOrderKind(raw: unknown): GenerationOrderKind | null {
  if (raw === "query_full" || raw === "intent_regen" || raw === "article_regen_keep_title") return raw
  return null
}

function parseOrderStatus(raw: unknown): "queued" | "running" | "completed" | "failed" | "cancelled" | null {
  if (raw === "queued" || raw === "running" || raw === "completed" || raw === "failed" || raw === "cancelled") {
    return raw
  }
  return null
}

function getOrderScope(args: { kind: GenerationOrderKind; queryId: number; intentId: number | null }) {
  if (args.kind === "query_full") {
    return {
      scopeType: "query" as const,
      scopeKey: `query:${args.queryId}`,
    }
  }

  return {
    scopeType: "intent" as const,
    scopeKey: `intent:${args.queryId}:${args.intentId}`,
  }
}

export function createSearchRouter(ctx: AppCtx, eventDispatcher: EventDispatcher, magicApi: AbstractMagicApi) {
  const router = Router()
  const searchDB = ctx.dbClients.search()
  const configDB = ctx.dbClients.config()
  const llmDB = ctx.dbClients.llm()

  const callMagicWithRetry = async <T>(args: {
    trigger: "spelling-correction"
    query: string
    run: () => Promise<T>
  }): Promise<T> => {
    const retryMaxAttempts = parsePositiveIntOrDefault(configDB.getValue("llm.retry.max_attempts"), 2)
    const timeoutMs = parsePositiveIntOrDefault(configDB.getValue("llm.retry.timeout_ms"), 40000)
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
        return result
      } catch (error) {
        lastError = error
        const durationMs = Date.now() - startMs
        const details = errorDetails(error)
        llmDB.createFailure({
          provider: magicApi.providerName({}),
          component: "search.router",
          trigger: args.trigger,
          model: configDB.getValue("search.spelling_correction.model"),
          queryText: args.query,
          callId,
          attempt,
          durationMs,
          errorName: details.errorName,
          errorMessage: details.errorMessage,
          details: errorStorageDetails(error),
        })
        logLine(
          "error",
          `LLM search ${args.trigger} query="${ellipsis40(args.query)}" provider=${magicApi.providerName({})} error ${durationMs}ms attempt=${attempt} cid=${callId} msg="${details.errorMessage}"`
        )
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
          if (isPlausibleCorrection(originalQueryValue, cached.correctedText)) {
            correctedCandidate = cached.correctedText
          }
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

          const nextCandidate = correction.text.trim()
          if (isPlausibleCorrection(originalQueryValue, nextCandidate)) {
            correctedCandidate = nextCandidate
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

  router.get("/orders/availability", (req, res) => {
    const kind = parseOrderKind(req.query.kind)
    const queryId = typeof req.query.queryId === "string" ? parseQueryId(req.query.queryId) : null
    const intentId = typeof req.query.intentId === "string" ? parseQueryId(req.query.intentId) : null

    if (!kind || !queryId) {
      res.status(400).json({ error: "kind and queryId are required" })
      return
    }

    const scope = kind === "query_full"
      ? searchDB.listActiveOrdersForScope({ scopeType: "query", queryId })
      : searchDB.listActiveOrdersForScope({ scopeType: "intent", queryId, intentId: intentId ?? undefined })

    if (scope.length > 0) {
      const activeOrder = scope[0]
      res.json({
        available: false,
        reason: "locked",
        activeOrderId: activeOrder.id,
        scope: kind === "query_full" ? "query" : "intent",
      })
      return
    }

    res.json({
      available: true,
      reason: "ok",
      scope: kind === "query_full" ? "query" : "intent",
    })
  })

  router.post("/orders", (req, res) => {
    const kind = parseOrderKind(req.body?.kind)
    const queryId = parseQueryId(String(req.body?.queryId ?? ""))
    const intentId = req.body?.intentId === undefined || req.body?.intentId === null
      ? null
      : parseQueryId(String(req.body.intentId))

    if (!kind || !queryId) {
      res.status(400).json({ error: "kind and queryId are required" })
      return
    }

    const query = searchDB.getQueryById(queryId)
    if (!query) {
      res.status(404).json({ error: "query not found" })
      return
    }

    if (kind !== "query_full") {
      if (!intentId) {
        res.status(400).json({ error: "intentId is required" })
        return
      }
      const intentExists = searchDB.listIntentsByQueryId(queryId).some((intent) => intent.id === intentId)
      if (!intentExists) {
        res.status(404).json({ error: "intent not found for query" })
        return
      }
    }

    const activeOrders = kind === "query_full"
      ? searchDB.listActiveOrdersForScope({ scopeType: "query", queryId })
      : searchDB.listActiveOrdersForScope({ scopeType: "intent", queryId, intentId: intentId ?? undefined })

    if (kind !== "query_full") {
      const activeQueryOrders = searchDB
        .listActiveOrdersForScope({ scopeType: "query", queryId })
        .filter((order) => order.kind === "query_full")
      if (activeQueryOrders.length > 0) {
        const activeOrder = activeQueryOrders[0]
        res.status(409).json({
          code: "RESOURCE_LOCKED",
          error: "resource is locked",
          activeOrderId: activeOrder.id,
          scope: "query",
        })
        return
      }
    }

    if (activeOrders.length > 0) {
      const activeOrder = activeOrders[0]
      res.status(409).json({
        code: "RESOURCE_LOCKED",
        error: "resource is locked",
        activeOrderId: activeOrder.id,
        scope: kind === "query_full" ? "query" : "intent",
      })
      return
    }

    const order = searchDB.createGenerationOrder({
      queryId,
      kind,
      intentId,
      requestedBy: "user",
      requestPayload: {
        keepTitle: kind === "article_regen_keep_title",
      },
    })

    res.json({
      orderId: order.id,
      queryId: order.queryId,
      kind: order.kind,
      status: order.status,
    })
  })

  // Compatibility wrappers for old frontend calls.
  router.post("/query/:query_id/rerun-intents", (req, res) => {
    const queryId = parseQueryId(req.params.query_id)
    if (!queryId) {
      res.status(400).json({ error: "Invalid query_id" })
      return
    }

    const active = searchDB.listActiveOrdersForScope({ scopeType: "query", queryId })
    if (active.length > 0) {
      res.status(409).json({ code: "RESOURCE_LOCKED", activeOrderId: active[0].id })
      return
    }

    const order = searchDB.createGenerationOrder({
      queryId,
      kind: "query_full",
      requestedBy: "user",
    })

    res.json({ queryId, accepted: true, mode: "rerun-intents", orderId: order.id })
  })

  router.post("/query/:query_id/intents/:intent_id/rerun-article", (req, res) => {
    const queryId = parseQueryId(req.params.query_id)
    const intentId = parseQueryId(req.params.intent_id)
    if (!queryId || !intentId) {
      res.status(400).json({ error: "Invalid query_id or intent_id" })
      return
    }

    const active = searchDB.listActiveOrdersForScope({ scopeType: "intent", queryId, intentId })
    if (active.length > 0) {
      res.status(409).json({ code: "RESOURCE_LOCKED", activeOrderId: active[0].id })
      return
    }

    const order = searchDB.createGenerationOrder({
      queryId,
      intentId,
      kind: "article_regen_keep_title",
      requestedBy: "user",
      requestPayload: { keepTitle: true },
    })

    res.json({ queryId, accepted: true, mode: "rerun-articles", intentId, orderId: order.id })
  })

  router.get("/orders/:order_id", (req, res) => {
    const orderId = parseQueryId(req.params.order_id)
    if (!orderId) {
      res.status(400).json({ error: "Invalid order_id" })
      return
    }

    try {
      const order = searchDB.getGenerationOrderById(orderId)
      res.json({ order })
    } catch {
      res.status(404).json({ error: "order not found" })
    }
  })

  router.get("/orders", (req, res) => {
    const limitRaw = typeof req.query.limit === "string" ? req.query.limit : null
    const limit = parsePositiveIntOrDefault(limitRaw, 120)
    const status = parseOrderStatus(req.query.status)
    const kind = parseOrderKind(req.query.kind)

    const orders = searchDB.listGenerationOrders({
      limit,
      status: status ?? undefined,
      kind: kind ?? undefined,
    })
    res.json({
      orders: orders.map((order) => {
        const query = searchDB.getQueryById(order.queryId)
        const intent = order.intentId ? searchDB.getIntentById(order.intentId) : null
        return {
          ...order,
          query: query ? { id: query.id, value: query.value, language: query.language } : null,
          intent: intent ? { id: intent.id, value: intent.intent } : null,
        }
      }),
    })
  })

  router.get("/orders/:order_id/logs", (req, res) => {
    const orderId = parseQueryId(req.params.order_id)
    if (!orderId) {
      res.status(400).json({ error: "Invalid order_id" })
      return
    }

    try {
      searchDB.getGenerationOrderById(orderId)
      const logs = searchDB.listGenerationLogs(orderId)
      res.json({ logs })
    } catch {
      res.status(404).json({ error: "order not found" })
    }
  })

  router.get("/llm/failures", (req, res) => {
    const limitRaw = typeof req.query.limit === "string" ? req.query.limit : null
    const limit = parsePositiveIntOrDefault(limitRaw, 120)
    const provider = typeof req.query.provider === "string" ? req.query.provider.trim() : ""
    const trigger = typeof req.query.trigger === "string" ? req.query.trigger.trim() : ""
    const component = typeof req.query.component === "string" ? req.query.component.trim() : ""

    const failures = llmDB.listFailures({
      limit,
      provider: provider || undefined,
      trigger: trigger || undefined,
      component: component || undefined,
    })
    res.json({ failures })
  })

  router.get("/orders/:order_id/stream", (req, res) => {
    const orderId = parseQueryId(req.params.order_id)
    if (!orderId) {
      res.status(400).json({ error: "Invalid order_id" })
      return
    }

    let order: GenerationOrderRecord
    try {
      order = searchDB.getGenerationOrderById(orderId)
    } catch {
      res.status(404).json({ error: "order not found" })
      return
    }

    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    let isClosed = false

    const finish = () => {
      if (isClosed) return
      isClosed = true
      res.end()
    }

    req.on("close", finish)

    const sendEvent = (seq: number, event: GenerationOrderEvent) => {
      if (isClosed) return
      res.write(`id: ${seq}\n`)
      res.write(`event: ${event.type}\n`)
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    const afterSeqRaw = req.header("Last-Event-ID") || req.query.afterSeq
    const afterSeq = typeof afterSeqRaw === "string" ? Number.parseInt(afterSeqRaw, 10) : 0
    const replay = eventDispatcher.replayAfter({ orderId, afterSeq: Number.isInteger(afterSeq) ? afterSeq : 0 })

    let ended = false
    for (const item of replay) {
      sendEvent(item.seq, item.event)
      if (item.event.type === "order.completed" || item.event.type === "order.failed") {
        ended = true
      }
    }

    if (!ended) {
      const latest = searchDB.getGenerationOrderById(orderId)
      if (latest.status === "completed") {
        sendEvent(0, {
          type: "order.completed",
          orderId,
          queryId: latest.queryId,
        })
        ended = true
      } else if (latest.status === "failed") {
        sendEvent(0, {
          type: "order.failed",
          orderId,
          queryId: latest.queryId,
          message: latest.errorMessage || "Order failed",
        })
        ended = true
      }
    }

    if (ended) {
      finish()
      return
    }

    const unsubscribe = eventDispatcher.subscribe({
      orderId,
      send: ({ seq, event }) => {
        sendEvent(seq, event)
        if (event.type === "order.completed" || event.type === "order.failed") {
          unsubscribe()
          clearInterval(heartbeat)
          finish()
        }
      },
    })

    const heartbeat = setInterval(() => {
      if (!isClosed) res.write(": ping\n\n")
    }, 15000)

    req.on("close", () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
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
