import express from "express"
import { AppCtx } from "../appCtx.js"
import { createConfigRouter } from "./routes/config.js"
import { createSearchRouter } from "./routes/search.js"
import { createMailRouter } from "./routes/mail.js"

export function createServer(appCtx: AppCtx) {
    const app = express()
    app.use(express.json())

    if (appCtx.config.server.enableConfigRoutes) {
        app.use("/api", createConfigRouter(appCtx))
    }

    app.use("/api", createSearchRouter(appCtx))
    app.use("/api", createMailRouter(appCtx))

    return app
}

export function startServer(appCtx: AppCtx) {
    const app = createServer(appCtx)
    const { host, port } = appCtx.config.server
    return app.listen(port, host, () => {
        console.log(`Server running on http://${host}:${port}`)
    })
}
