import Database from "better-sqlite3"
import path from "path"
import { runMigrations } from "./setup.js"

let db: Database.Database | null = null

export function initDB() {
    if (db) return db

    const dbPath = path.join(process.cwd(), "app.db")
    db = new Database(dbPath)

    db.pragma("journal_mode = WAL")
    db.pragma("foreign_keys = ON")

    runMigrations(db)

    return db
}

export function getDB() {
    if (!db) throw new Error("DB not initialized")
    return db
}