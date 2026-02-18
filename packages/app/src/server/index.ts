import express from "express"
import { AppCtx } from "../appCtx.js"
import { createConfigRouter } from "./routes/config.js"
import { createSearchRouter } from "./routes/search.js"
import { createMailRouter } from "./routes/mail.js"
import { MailEventHub, startMailWorker } from "./mailWorker.js"

export function createServer(appCtx: AppCtx) {
    const app = express()
    app.use(express.json())
    const mailEventHub = new MailEventHub(appCtx)

    if (appCtx.config.server.enableConfigRoutes) {
        app.use("/api/config", createConfigRouter(appCtx))
    }

    app.use("/api", createSearchRouter(appCtx))
    app.use("/api", createMailRouter(appCtx, mailEventHub))
    app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        const message = err instanceof Error ? err.message : "Internal server error"
        console.error(err)
        res.status(500).json({ error: message })
    })

    return {
        app,
        mailEventHub,
    }
}

export function startServer(appCtx: AppCtx) {
    const { app, mailEventHub } = createServer(appCtx)
    const stopWorker = startMailWorker(appCtx, mailEventHub)
    const { host, port } = appCtx.config.server
    const server = app.listen(port, host, () => {
        console.log(`Server running on http://${host}:${port}`)
    })

    server.on("close", () => {
        stopWorker()
    })

    return server
}
