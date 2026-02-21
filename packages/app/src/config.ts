import path from "node:path"
import { getAppDataPath } from "./utils.js"

export type AppConfig = {

    app: {
        storagePath: string // env: YAH_STORAGE_PATH default to getDefaultStroagePath().
        debug: boolean // env: YAH_DEBUG default=0
    },

    db: {
        dbPath: string // env: YAH_DB_PATH default to platform idael place for data.
        onDBSchemaConflict: 'backup-and-overwrite' | 'quit' // env: YAH_ON_DB_SCHEMA_CONFLICT default=quit
    }

    server: {
        enableConfigRoutes: boolean // env: YAH_ENABLE_CONFIG_ROUTES default=1
        host: string // env:  YAH_HOST default=127.0.0.1
        port: number // env:  YAH_HOST default=11111
    }

    api: {
        apiKeySource: 'env' | 'keychain'  // env: YAH_API_KEY_SOURCE default=env
        magicProvider: 'openai' | 'dev' // env: YAH_MAGIC_PROVIDER default=openai
        apiKey: string // YAH_API_KEY if apiKeySource='env' otherwise load from keytar
    }

}

function getDefaultDBPath(): string {
    return path.join(getAppDataPath(), "app.db")
}

function getDefaultStroagePath(): string {
    return path.join(getAppDataPath(), "data")
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value == null || value.trim() === "") return defaultValue
    const normalized = value.trim().toLowerCase()
    if (normalized === "1" || normalized === "true") return true
    if (normalized === "0" || normalized === "false") return false
    throw new Error(`Invalid boolean value "${value}"`)
}

function parsePort(value: string | undefined, defaultValue: number): number {
    if (value == null || value.trim() === "") return defaultValue
    const parsed = Number.parseInt(value, 10)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`Invalid port "${value}"`)
    }
    return parsed
}

function parseSchemaConflictMode(
    value: string | undefined
): "backup-and-overwrite" | "quit" {
    if (value == null || value.trim() === "") return "quit"
    if (value === "backup-and-overwrite" || value === "quit") return value
    throw new Error(
        `Invalid YAH_ON_DB_SCHEMA_CONFLICT "${value}". Expected "backup-and-overwrite" or "quit".`
    )
}

function parseApiKeySource(value: string | undefined): "env" | "keychain" {
    if (value == null || value.trim() === "") return "env"
    if (value === "env" || value === "keychain") return value
    throw new Error(
        `Invalid YAH_API_KEY_SOURCE "${value}". Expected "env" or "keychain".`
    )
}

function parseMagicProvider(value: string | undefined): "openai" | "dev" {
    if (value == null || value.trim() === "") return "openai"
    if (value === "openai" || value === "dev") return value
    throw new Error(
        `Invalid YAH_MAGIC_PROVIDER "${value}". Expected "openai" or "dev".`
    )
}

export async function getAppConfig(): Promise<AppConfig> {
    const storagePath = process.env.YAH_STORAGE_PATH || getDefaultStroagePath()
    const dbPath = process.env.YAH_DB_PATH || getDefaultDBPath()
    const onDBSchemaConflict = parseSchemaConflictMode(
        process.env.YAH_ON_DB_SCHEMA_CONFLICT
    )
    const enableConfigRoutes = parseBoolean(
        process.env.YAH_ENABLE_CONFIG_ROUTES,
        true
    )
    const host = process.env.YAH_HOST || "127.0.0.1"
    const port = parsePort(process.env.YAH_PORT, 11111)
    const apiKeySource = parseApiKeySource(process.env.YAH_API_KEY_SOURCE)
    const magicProvider = parseMagicProvider(process.env.YAH_MAGIC_PROVIDER)
    const debug = parseBoolean(process.env.YAH_DEBUG, false)

    let apiKey = ""
    if (apiKeySource === "env") {
        apiKey = process.env.YAH_API_KEY || ""
    } else {
        // Keychain integration is not wired yet; fail explicitly instead of silently
        // misconfiguring the app.
        throw new Error(
            "YAH_API_KEY_SOURCE=keychain is not implemented yet. Use YAH_API_KEY_SOURCE=env."
        )
    }

    return {
        app: {
            storagePath,
            debug,
        },
        db: {
            dbPath,
            onDBSchemaConflict,
        },
        server: {
            enableConfigRoutes,
            host,
            port,
        },
        api: {
            apiKeySource,
            magicProvider,
            apiKey,
        },

    }
}

export const getAppConfigFunction = getAppConfig
