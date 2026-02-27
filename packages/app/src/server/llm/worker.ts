import { AppCtx } from "../../appCtx.js"
import { logDebugJson, logLine } from "../../logging/index.js"
import { EventDispatcher } from "./eventDispatcher.js"
import { createSearchGenerateHandler } from "./handlers/searchGenerate.js"
import { LLMRuntimeConfigCache } from "./runtimeConfigCache.js"
import { createMagicApi } from "../../magic/factory.js"

export function startLLMWorker(appCtx: AppCtx, eventDispatcher: EventDispatcher): () => void {
  const searchDB = appCtx.dbClients.search()
  const runtimeConfigCache = new LLMRuntimeConfigCache(appCtx, 5000)
  const magicApi = createMagicApi({ appCtx })
  const searchGenerateHandler = createSearchGenerateHandler({
    appCtx,
    eventDispatcher,
    runtimeConfigCache,
    magicApi,
  })

  let stopped = false
  const inFlight = new Set<number>()

  const parsePositiveIntOrDefault = (input: string | null, defaultValue: number): number => {
    if (!input) return defaultValue
    const parsed = Number.parseInt(input, 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue
  }

  const getMaxConcurrency = (): number => {
    const configDB = appCtx.dbClients.config()
    const raw = configDB.getValue("llm.worker.max_concurrency")
    return Math.min(parsePositiveIntOrDefault(raw, 3), 16)
  }

  const processOrder = async (orderId: number) => {
    try {
      const order = searchDB.getGenerationOrderById(orderId)
      await searchGenerateHandler(order)
      searchDB.completeGenerationOrder(order.id, {
        kind: order.kind,
        queryId: order.queryId,
        intentId: order.intentId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown order worker error"
      searchDB.failGenerationOrder(orderId, message)
      searchDB.appendGenerationLog({
        orderId,
        stage: "order",
        level: "error",
        message,
      })
    } finally {
      inFlight.delete(orderId)
    }
  }

  const pump = async () => {
    if (stopped) return
    try {
      const maxConcurrency = getMaxConcurrency()
      while (!stopped && inFlight.size < maxConcurrency) {
        const order = searchDB.claimNextQueuedOrder()
        if (!order) break
        inFlight.add(order.id)
        void processOrder(order.id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown LLM worker fatal error"
      logLine("error", `LLM worker loop failed: ${message}`)
      logDebugJson(appCtx.config.app.debug, {
        level: "error",
        event: "llm.worker.error",
        message,
      })
    }
  }

  const interval = setInterval(() => {
    void pump()
  }, 300)

  return () => {
    stopped = true
    clearInterval(interval)
  }
}
