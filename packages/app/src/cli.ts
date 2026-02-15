import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import dotenv from "dotenv"
import { AppCtx } from "./appCtx.js"
import { getAppConfigFunction } from "./config.js"
import { startServer } from "./server/index.js"
import { getAppDataPath } from "./utils.js"

dotenv.config({ path: path.join(getAppDataPath(), ".env") })
dotenv.config({ path: path.join(process.cwd(), ".env"), override: true })


function printUsage() {
    console.log("Usage:")
    console.log("  yah start")
    console.log("  yah config get <key>")
    console.log("  yah config set <key> -v <value>")
    console.log("  yah config set <key> -e")
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

    if (command === "config") {
        const subCommand = args[1]
        const key = args[2]
        if (!subCommand || !key) {
            printUsage()
            process.exitCode = 1
            return
        }

        const configClient = appCtx.dbClients.config()

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
