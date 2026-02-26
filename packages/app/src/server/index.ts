import express from "express"
import { AppCtx } from "../appCtx.js"
import { createConfigRouter } from "./routes/config.js"
import { createSearchRouter } from "./routes/search.js"
import { EventDispatcher } from "./llm/eventDispatcher.js"
import { startLLMWorker } from "./llm/worker.js"
import { createMagicApi } from "../magic/factory.js"
import { createRequestLogger } from "./middleware/requestLogger.js"
import { logDebugJson, logLine } from "../logging/index.js"

export function createServer(appCtx: AppCtx) {
    const app = express()
    app.use(express.json())
    app.use(createRequestLogger({ debug: appCtx.config.app.debug }))
    const eventDispatcher = new EventDispatcher(appCtx)
    const magicApi = createMagicApi({ appCtx })

    if (appCtx.config.server.enableConfigRoutes) {
        app.use("/api/config", createConfigRouter(appCtx))
    }

    app.use("/api", createSearchRouter(appCtx, eventDispatcher, magicApi))
    app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        const message = err instanceof Error ? err.message : "Internal server error"
        logLine("error", `HTTP ERROR ${message}`)
        logDebugJson(appCtx.config.app.debug, {
            level: "error",
            event: "http.error",
            message,
            error: err instanceof Error ? err.stack || err.message : String(err),
        })
        res.status(500).json({ error: message })
    })

    return {
        app,
        eventDispatcher,
    }
}

export function startServer(appCtx: AppCtx) {
    const { app, eventDispatcher } = createServer(appCtx)
    const stopWorker = startLLMWorker(appCtx, eventDispatcher)
    const { host, port } = appCtx.config.server
    const server = app.listen(port, host, () => {
        logLine("info", `Server running on http://${host}:${port}`)
    })

    server.on("close", () => {
        stopWorker()
    })

    return server
}
