import express from "express"
import { AppCtx } from "../appCtx.js"
import { createConfigRouter } from "./routes/config.js"
import { createSearchRouter } from "./routes/search.js"
import { createGuideRouter } from "./routes/guide.js"
import { EventDispatcher } from "./llm/eventDispatcher.js"
import { startLLMWorker } from "./llm/worker.js"
import { createMagicApi } from "../magic/factory.js"
import { createRequestLogger } from "./middleware/requestLogger.js"
import { logDebugJson, logLine } from "../logging/index.js"
import path from "node:path"
import fs from "node:fs"
import { spawn } from "node:child_process"

function resolveOpenUrlHost(host: string): string {
    const normalized = host.trim()
    if (!normalized) return "127.0.0.1"
    if (normalized === "0.0.0.0" || normalized === "::" || normalized === "::0") return "127.0.0.1"
    return normalized
}

function openBrowser(url: string): void {
    if (process.platform === "darwin") {
        const child = spawn("open", [url], { detached: true, stdio: "ignore" })
        child.unref()
        return
    }
    if (process.platform === "win32") {
        const child = spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" })
        child.unref()
        return
    }
    const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" })
    child.unref()
}

export function createServer(appCtx: AppCtx) {
    const app = express()
    app.use(express.json())
    app.use(createRequestLogger({ debug: appCtx.config.app.debug }))

    app.use("/api", (req, res, next) => {
        delete req.headers["if-none-match"]
        delete req.headers["if-modified-since"]
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
        res.setHeader("Pragma", "no-cache")
        res.setHeader("Expires", "0")
        next()
    })

    const eventDispatcher = new EventDispatcher(appCtx)
    const magicApi = createMagicApi({ appCtx })

    if (appCtx.config.server.enableConfigRoutes) {
        app.use("/api/config", createConfigRouter(appCtx))
    }

    app.use("/api/guide", createGuideRouter(appCtx))
    app.use("/api", createSearchRouter(appCtx, eventDispatcher, magicApi))

    const publicPath = appCtx.config.server.publicPath
    if (appCtx.config.server.serveWebUI && publicPath && fs.existsSync(publicPath)) {
        app.use(express.static(publicPath))
        app.get("*", (req, res, next) => {
            if (req.path.startsWith("/api/")) {
                next()
                return
            }
            res.sendFile(path.join(publicPath, "index.html"))
        })
    }

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
    const { host, port, openBrowser: shouldOpenBrowser } = appCtx.config.server
    const server = app.listen(port, host, () => {
        logLine("info", `Server running on http://${host}:${port}`)
        if (shouldOpenBrowser) {
            const url = `http://${resolveOpenUrlHost(host)}:${port}`
            try {
                openBrowser(url)
                logLine("info", `Opened browser: ${url}`)
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                logLine("info", `Failed to open browser: ${message}`)
            }
        }
    })

    server.on("close", () => {
        stopWorker()
    })

    return server
}
