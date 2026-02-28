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
import { getPresetValues, parsePresetName, type PresetName } from "./configPreset.js"

dotenv.config({ path: path.join(getAppDataPath(), ".env"), quiet: true })
dotenv.config({ path: path.join(process.cwd(), ".env"), override: true, quiet: true })

const DEFAULT_ENV_TEMPLATE = `# yah environment configuration
# Lines are commented by default. Uncomment and set values as needed.
#
# Typical first-run steps:
# 1) Run: npx @ootc/yah config preset openai
# 2) Uncomment one provider API key below.

# Provider API keys
# OPENAI_API_KEY=
# ZAI_API_KEY=
# DEEPSEEK_API_KEY=
# MOONSHOT_API_KEY=

# Server
# YAH_HOST=127.0.0.1
# YAH_PORT=11111
# YAH_ENABLE_CONFIG_ROUTES=1
# YAH_SERVE_WEB_UI=1
# YAH_OPEN_BROWSER=1
# YAH_DEBUG=0

# Runtime paths
# YAH_STORAGE_PATH=
# YAH_DOCS_PATH=
# YAH_PUBLIC_PATH=

# API provider
# YAH_MAGIC_PROVIDER=openai

# DB schema conflict mode
# YAH_ON_DB_SCHEMA_CONFLICT=quit
`


function printUsage() {
    console.log("Usage:")
    console.log("  yah start")
    console.log("  yah db init")
    console.log("  yah db reset [--yes]")
    console.log("  yah env edit")
    console.log("  yah env location")
    console.log("  yah config list")
    console.log("  yah config get <key>")
    console.log("  yah config set <key> -v <value>")
    console.log("  yah config set <key> -e")
    console.log("  yah config preset <openai|zai|deepseek|moonshot>")
}

function applyConfigPreset(args: { configClient: ConfigClient; preset: PresetName }) {
    const { configClient, preset } = args
    const entries = Object.entries(getPresetValues(preset))
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

function editFileInEditor(filePath: string) {
    const editor = process.env.EDITOR || "vi"
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, DEFAULT_ENV_TEMPLATE, "utf8")
    }
    const result = spawnSync(editor, [filePath], { stdio: "inherit" })
    if (result.error) throw result.error
    if (result.status !== 0) {
        throw new Error(`Editor exited with status ${result.status}`)
    }
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

function printMissingApiKeySetupHelp(errorMessage: string): boolean {
    const match = errorMessage.match(/Set environment variable:\s*([A-Z0-9_]+)/)
    if (!match?.[1]) return false

    const envName = match[1]
    const presetByEnvName: Record<string, string> = {
        OPENAI_API_KEY: "openai",
        ZAI_API_KEY: "zai",
        DEEPSEEK_API_KEY: "deepseek",
        MOONSHOT_API_KEY: "moonshot",
    }
    const suggestedPreset = presetByEnvName[envName] || "openai"

    console.error(errorMessage)
    console.error("")
    console.error("LLM setup required before starting server:")
    console.error(`1. Apply preset: npx @ootc/yah config preset ${suggestedPreset}`)
    console.error("2. Edit env file: npx @ootc/yah env edit")
    console.error(`3. Add API key: ${envName}=your_key_here`)
    console.error("4. Start server: npx @ootc/yah start")
    console.error("")
    console.error("Helpful command: npx @ootc/yah env location")
    return true
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
        if (subCommand === "init") {
            appCtx.getDB()
            console.log("Database initialized.")
            return
        }
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

    if (command === "env") {
        const subCommand = args[1]
        const envPath = path.join(getAppDataPath(), ".env")
        if (subCommand === "location") {
            console.log(envPath)
            return
        }
        if (subCommand !== "edit") {
            printUsage()
            process.exitCode = 1
            return
        }
        editFileInEditor(envPath)
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

        if (subCommand === "list") {
            const configs = configClient.listConfigs()
            if (configs.length === 0) return
            for (const item of configs) {
                if (item.description.trim()) {
                    console.log(`${item.key}=${item.value}  # ${item.description}`)
                } else {
                    console.log(`${item.key}=${item.value}`)
                }
            }
            return
        }

        if (subCommand === "preset") {
            const preset = parsePresetName(args[2])
            if (!preset) {
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
    const message = error instanceof Error ? error.message : String(error)
    if (printMissingApiKeySetupHelp(message)) {
        process.exit(1)
    }
    console.error(message)
    process.exit(1)
})
