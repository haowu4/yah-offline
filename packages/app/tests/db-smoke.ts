import { migrations } from "../src/db/migration.js"

type SmokeDB = {
    kind: "better-sqlite3" | "node:sqlite"
    exec: (sql: string) => void
    getTableNames: () => string[]
    close: () => void
}

async function openInMemoryDB(): Promise<SmokeDB> {
    try {
        const { default: BetterSqlite3 } = await import("better-sqlite3")
        const db = new BetterSqlite3(":memory:")
        db.pragma("foreign_keys = ON")

        return {
            kind: "better-sqlite3",
            exec: (sql) => db.exec(sql),
            getTableNames: () =>
                db
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
                    )
                    .all()
                    .map((row: any) => row.name),
            close: () => db.close(),
        }
    } catch {
        const { DatabaseSync } = await import("node:sqlite")
        const db = new DatabaseSync(":memory:")
        db.exec("PRAGMA foreign_keys = ON")

        return {
            kind: "node:sqlite",
            exec: (sql) => db.exec(sql),
            getTableNames: () =>
                db
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
                    )
                    .all()
                    .map((row: any) => row.name),
            close: () => db.close(),
        }
    }
}

async function main() {
    const db = await openInMemoryDB()

    try {
        for (const migration of migrations) {
            db.exec(migration.sql)
        }

        const tables = db.getTableNames()
        if (!tables.includes("mail_search_fts")) {
            throw new Error("Expected mail_search_fts table to exist after migrations")
        }

        console.log(`Migration smoke test passed (${db.kind}).`)
        console.log("Tables:", tables.join(", "))
    } finally {
        db.close()
    }
}

main()
