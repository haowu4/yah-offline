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
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
