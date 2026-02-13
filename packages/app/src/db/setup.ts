import Database from "better-sqlite3"
import { migrations } from "./migration.js"

export function runMigrations(db: Database.Database) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      run_at TEXT NOT NULL
    )
  `)

    const applied = new Set(
        db.prepare("SELECT name FROM _migrations").all().map((r: any) => r.name)
    )

    for (const migration of migrations) {
        if (applied.has(migration.name)) continue

        const tx = db.transaction(() => {
            db.exec(migration.sql)
            db.prepare(
                "INSERT INTO _migrations (name, run_at) VALUES (?, datetime('now'))"
            ).run(migration.name)
        })

        tx()

        console.log("Applied migration:", migration.name)
    }
}