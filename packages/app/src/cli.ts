import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import dotenv from "dotenv"
import { AppCtx } from "./appCtx.js"
import { getAppConfigFunction } from "./config.js"
import { startServer } from "./server/index.js"
import { getAppDataPath } from "./utils.js"
import { ConfigClient } from "./db/clients/config.js"

dotenv.config({ path: path.join(getAppDataPath(), ".env") })
dotenv.config({ path: path.join(process.cwd(), ".env"), override: true })


function printUsage() {
    console.log("Usage:")
    console.log("  yah start")
    console.log("  yah db reset [--yes]")
    console.log("  yah config get <key>")
    console.log("  yah config set <key> -v <value>")
    console.log("  yah config set <key> -e")
    console.log("  yah config preset <openai|zai|deepseek|moonshot>")
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

const DEEPSEEK_MODELS = [
    "deepseek-chat",
    "deepseek-reasoner",
]

const MOONSHOT_MODELS = [
    "kimi-k2.5",
    "kimi-k2-turbo-preview",
    "kimi-k2-thinking",
    "kimi-k2-thinking-turbo",
]

function applyConfigPreset(args: { configClient: ConfigClient; preset: PresetName }) {
    const { configClient, preset } = args

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
            "llm.baseurl": "https://api.deepseek.com",
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
    const tx = configClient.db.transaction(() => {
        for (const [key, value] of entries) {
            configClient.setValue(key, value)
        }
    })
    tx()
}

function readValueFromEditor(initialValue = ""): string {
    const editor = process.env.EDITOR || "vi"
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yah-config-"))
    const tempFile = path.join(tempDir, "value.txt")
    fs.writeFileSync(tempFile, initialValue, "utf8")

    const result = spawnSync(editor, [tempFile], { stdio: "inherit" })
    if (result.error) {
        throw result.error
    }
    if (result.status !== 0) {
        throw new Error(`Editor exited with status ${result.status}`)
    }

    const value = fs.readFileSync(tempFile, "utf8").replace(/\n$/, "")
    fs.rmSync(tempDir, { recursive: true, force: true })
    return value
}

function parseSetValueArgs(args: string[]): { value: string } {
    const valueFlagIndex = args.indexOf("-v")
    if (valueFlagIndex >= 0) {
        const value = args[valueFlagIndex + 1]
        if (value == null) {
            throw new Error("Missing value after -v")
        }
        return { value }
    }

    if (args.includes("-e")) {
        return { value: readValueFromEditor() }
    }

    throw new Error('Expected either "-v <value>" or "-e"')
}

async function confirmResetDB(dbPath: string): Promise<boolean> {
    console.log("WARNING: This will permanently delete all data in your database.")
    console.log(`Database path: ${dbPath}`)
    const rl = createInterface({ input, output })
    try {
        const answer = (await rl.question('Type "RESET" to continue: ')).trim()
        return answer === "RESET"
    } finally {
        rl.close()
    }
}

function resetDBFiles(dbPath: string) {
    fs.rmSync(dbPath, { force: true })
    fs.rmSync(`${dbPath}-wal`, { force: true })
    fs.rmSync(`${dbPath}-shm`, { force: true })
}

async function main() {
    const args = process.argv.slice(2)
    const command = args[0]

    if (!command) {
        printUsage()
        process.exitCode = 1
        return
    }

    const config = await getAppConfigFunction()
    const appCtx = new AppCtx(config)

    if (command === "start") {
        appCtx.getDB()
        startServer(appCtx)
        return
    }

    if (command === "db") {
        const subCommand = args[1]
        if (subCommand !== "reset") {
            printUsage()
            process.exitCode = 1
            return
        }

        const forceYes = args.includes("--yes")
        const confirmed = forceYes ? true : await confirmResetDB(config.db.dbPath)
        if (!confirmed) {
            console.log("Aborted.")
            process.exitCode = 1
            return
        }

        resetDBFiles(config.db.dbPath)
        const freshCtx = new AppCtx(config)
        freshCtx.getDB()
        console.log("Database reset complete.")
        return
    }

    if (command === "config") {
        const subCommand = args[1]
        if (!subCommand) {
            printUsage()
            process.exitCode = 1
            return
        }

        const configClient = appCtx.dbClients.config()

        if (subCommand === "preset") {
            const preset = args[2] as PresetName | undefined
            if (preset !== "openai" && preset !== "zai" && preset !== "deepseek" && preset !== "moonshot") {
                printUsage()
                process.exitCode = 1
                return
            }
            applyConfigPreset({ configClient, preset })
            console.log(`Applied config preset: ${preset}`)
            return
        }

        const key = args[2]
        if (!key) {
            printUsage()
            process.exitCode = 1
            return
        }

        if (subCommand === "get") {
            const value = configClient.getValue(key)
            if (value == null) {
                process.exitCode = 1
                return
            }
            console.log(value)
            return
        }

        if (subCommand === "set") {
            const { value } = parseSetValueArgs(args.slice(3))
            configClient.setValue(key, value)
            return
        }
    }

    printUsage()
    process.exitCode = 1
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
