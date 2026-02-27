import path from "node:path"
import fs from "node:fs"
import { getAppDataPath } from "./utils.js"

export type AppConfig = {

    app: {
        storagePath: string // env: YAH_STORAGE_PATH default to getDefaultStroagePath().
        debug: boolean // env: YAH_DEBUG default=0
    },

    db: {
        dbPath: string // always: path.join(storagePath, "yah.db")
        onDBSchemaConflict: 'backup-and-overwrite' | 'quit' // env: YAH_ON_DB_SCHEMA_CONFLICT default=quit
    }

    server: {
        enableConfigRoutes: boolean // env: YAH_ENABLE_CONFIG_ROUTES default=1
        host: string // env:  YAH_HOST default=127.0.0.1
        port: number // env:  YAH_HOST default=11111
        docsPath: string // env: YAH_DOCS_PATH default to first existing known docs path
        publicPath: string | null // env: YAH_PUBLIC_PATH default to first existing known SPA dist path
    }

    api: {
        magicProvider: 'openai' | 'dev' // env: YAH_MAGIC_PROVIDER default=openai
    }

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

function parseMagicProvider(value: string | undefined): "openai" | "dev" {
    if (value == null || value.trim() === "") return "openai"
    if (value === "openai" || value === "dev") return value
    throw new Error(
        `Invalid YAH_MAGIC_PROVIDER "${value}". Expected "openai" or "dev".`
    )
}

function firstExistingPath(candidates: string[]): string | null {
    for (const candidate of candidates) {
        if (!candidate.trim()) continue
        if (fs.existsSync(candidate)) return candidate
    }
    return null
}

export async function getAppConfig(): Promise<AppConfig> {
    const storagePath = process.env.YAH_STORAGE_PATH || getDefaultStroagePath()
    const dbPath = path.join(storagePath, "yah.db")
    const onDBSchemaConflict = parseSchemaConflictMode(
        process.env.YAH_ON_DB_SCHEMA_CONFLICT
    )
    const enableConfigRoutes = parseBoolean(
        process.env.YAH_ENABLE_CONFIG_ROUTES,
        true
    )
    const host = process.env.YAH_HOST || "127.0.0.1"
    const port = parsePort(process.env.YAH_PORT, 11111)
    const magicProvider = parseMagicProvider(process.env.YAH_MAGIC_PROVIDER)
    const debug = parseBoolean(process.env.YAH_DEBUG, false)
    const docsPath =
        process.env.YAH_DOCS_PATH ||
        firstExistingPath([
            path.resolve(process.cwd(), "docs"),
            path.resolve(process.cwd(), "../../docs"),
            path.resolve(process.cwd(), "runtime/docs"),
        ]) ||
        path.resolve(process.cwd(), "docs")
    const publicPath =
        process.env.YAH_PUBLIC_PATH ||
        firstExistingPath([
            path.resolve(process.cwd(), "public"),
            path.resolve(process.cwd(), "../frontend/dist"),
            path.resolve(process.cwd(), "../../packages/frontend/dist"),
            path.resolve(process.cwd(), "runtime/public"),
        ])

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
            docsPath,
            publicPath,
        },
        api: {
            magicProvider,
        },

    }
}

export const getAppConfigFunction = getAppConfig
