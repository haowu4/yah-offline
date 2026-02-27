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
  let isRunning = false

  const runOnce = async () => {
    if (stopped || isRunning) return
    isRunning = true

    try {
      const order = searchDB.claimNextQueuedOrder()
      if (!order) return

      try {
        await searchGenerateHandler(order)
        searchDB.completeGenerationOrder(order.id, {
          kind: order.kind,
          queryId: order.queryId,
          intentId: order.intentId,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown order worker error"
        searchDB.failGenerationOrder(order.id, message)
        searchDB.appendGenerationLog({
          orderId: order.id,
          stage: "order",
          level: "error",
          message,
        })
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
