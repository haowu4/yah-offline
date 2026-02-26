import { Router } from "express"
import { AppCtx } from "../../appCtx.js"

function isUniqueConstraintError(error: unknown): boolean {
    return (
        error instanceof Error &&
        (error.message.includes("UNIQUE constraint failed") ||
            error.message.includes("constraint failed"))
    )
}

type PresetName = "openai" | "zai" | "deepseek" | "moonshot"

const OPENAI_MODELS = [
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5.2-chat-latest",
    "gpt-5.1-chat-latest",
    "gpt-5-chat-latest",
    "gpt-5.2-codex",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex",
    "gpt-5-codex",
    "gpt-5.2-pro",
    "gpt-5-pro",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-2024-05-13",
    "gpt-4o-mini",
]

const ZAI_MODELS = [
    "GLM-5",
    "GLM-5-Code",
    "GLM-4.7",
    "GLM-4.7-FlashX",
    "GLM-4.6",
    "GLM-4.5",
    "GLM-4.5-X",
    "GLM-4.5-Air",
    "GLM-4.5-AirX",
    "GLM-4-32B-0414-128K",
    "GLM-4.7-Flash",
    "GLM-4.5-Flash",
]

const DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner"]

const MOONSHOT_MODELS = [
    "kimi-k2.5",
    "kimi-k2-turbo-preview",
    "kimi-k2-thinking",
    "kimi-k2-thinking-turbo",
]

function parsePresetName(value: string | undefined): PresetName | null {
    if (value === "openai" || value === "zai" || value === "deepseek" || value === "moonshot") {
        return value
    }
    return null
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

        if (!key) {
            res.status(400).json({ error: "key is required" })
            return
        }

        if (typeof req.body?.value !== "string") {
            res.status(400).json({ error: "value is required" })
            return
        }

        if (req.body?.description !== undefined) {
            res.status(400).json({ error: "description is read-only" })
            return
        }

        try {
            const config = configDB.createConfig({
                key,
                value,
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

    router.post("/preset/:preset", (req, res) => {
        const preset = parsePresetName(req.params.preset?.trim())
        if (!preset) {
            res.status(400).json({ error: "invalid preset" })
            return
        }

        const presetValues: Record<PresetName, Record<string, string>> = {
            openai: {
                "llm.models": JSON.stringify(OPENAI_MODELS),
                "mail.default_model": "gpt-5.2-chat-latest",
                "mail.summary_model": "gpt-5-mini",
                "search.content_generation.model": "gpt-5.2-chat-latest",
                "search.intent_resolve.model": "gpt-5-mini",
                "search.spelling_correction.model": "gpt-5-mini",
                "llm.baseurl": "",
                "llm.apikey.env_name": "OPENAI_API_KEY",
                "llm.apikey.keychain_name": "openai/default",
            },
            zai: {
                "llm.models": JSON.stringify(ZAI_MODELS),
                "mail.default_model": "GLM-4.7",
                "mail.summary_model": "GLM-4.7-FlashX",
                "search.content_generation.model": "GLM-4.7",
                "search.intent_resolve.model": "GLM-4.7-FlashX",
                "search.spelling_correction.model": "GLM-4.7-FlashX",
                "llm.baseurl": "https://api.z.ai/api/paas/v4/",
                "llm.apikey.env_name": "ZAI_API_KEY",
                "llm.apikey.keychain_name": "zai/default",
            },
            deepseek: {
                "llm.models": JSON.stringify(DEEPSEEK_MODELS),
                "mail.default_model": "deepseek-chat",
                "mail.summary_model": "deepseek-chat",
                "search.content_generation.model": "deepseek-chat",
                "search.intent_resolve.model": "deepseek-chat",
                "search.spelling_correction.model": "deepseek-chat",
                "llm.baseurl": "https://api.deepseek.com/v1",
                "llm.apikey.env_name": "DEEPSEEK_API_KEY",
                "llm.apikey.keychain_name": "deepseek/default",
            },
            moonshot: {
                "llm.models": JSON.stringify(MOONSHOT_MODELS),
                "mail.default_model": "kimi-k2.5",
                "mail.summary_model": "kimi-k2-turbo-preview",
                "search.content_generation.model": "kimi-k2.5",
                "search.intent_resolve.model": "kimi-k2-turbo-preview",
                "search.spelling_correction.model": "kimi-k2-turbo-preview",
                "llm.baseurl": "https://api.moonshot.ai/v1",
                "llm.apikey.env_name": "MOONSHOT_API_KEY",
                "llm.apikey.keychain_name": "moonshot/default",
            },
        }

        const entries = Object.entries(presetValues[preset])
        const tx = configDB.db.transaction(() => {
            for (const [key, value] of entries) {
                configDB.setValue(key, value)
            }
        })
        tx()
        res.json({ ok: true, preset })
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

        if (req.body?.description !== undefined) {
            res.status(400).json({ error: "description is read-only" })
            return
        }

        const updated = configDB.updateConfig(key, {
            value: req.body.value,
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
