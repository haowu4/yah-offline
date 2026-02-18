import { Router } from "express"
import { AppCtx } from "../../appCtx.js"

function isUniqueConstraintError(error: unknown): boolean {
    return (
        error instanceof Error &&
        (error.message.includes("UNIQUE constraint failed") ||
            error.message.includes("constraint failed"))
    )
}

export function createConfigRouter(ctx: AppCtx) {
    const router = Router()
    const configDB = ctx.dbClients.config()

    router.get("/", (_req, res) => {
        const configs = configDB.listConfigs()
        res.json({ configs })
    })

    router.post("/", (req, res) => {
        const key = typeof req.body?.key === "string" ? req.body.key.trim() : ""
        const value = typeof req.body?.value === "string" ? req.body.value : ""
        const description =
            typeof req.body?.description === "string" ? req.body.description : ""

        if (!key) {
            res.status(400).json({ error: "key is required" })
            return
        }

        if (typeof req.body?.value !== "string") {
            res.status(400).json({ error: "value is required" })
            return
        }

        try {
            const config = configDB.createConfig({
                key,
                value,
                description,
            })
            res.status(201).json({ config })
        } catch (error) {
            if (isUniqueConstraintError(error)) {
                res.status(409).json({ error: "config key already exists" })
                return
            }
            res.status(400).json({
                error: error instanceof Error ? error.message : "Failed to create config",
            })
        }
    })

    router.put("/:key", (req, res) => {
        const key = req.params.key?.trim() ?? ""
        if (!key) {
            res.status(400).json({ error: "key is required" })
            return
        }

        if (typeof req.body?.value !== "string") {
            res.status(400).json({ error: "value is required" })
            return
        }

        const description =
            typeof req.body?.description === "string" ? req.body.description : ""

        const updated = configDB.updateConfig(key, {
            value: req.body.value,
            description,
        })

        if (!updated) {
            res.status(404).json({ error: "config not found" })
            return
        }

        res.json({ config: updated })
    })

    router.delete("/:key", (req, res) => {
        const key = req.params.key?.trim() ?? ""
        if (!key) {
            res.status(400).json({ error: "key is required" })
            return
        }

        const deleted = configDB.deleteConfig(key)
        if (!deleted) {
            res.status(404).json({ error: "config not found" })
            return
        }

        res.json({ ok: true })
    })

    return router
}
