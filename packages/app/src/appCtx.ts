import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import { AppConfig } from "./config.js"
import { detectMigrationConflicts, ensureMigrationsTable, runMigrations } from "./db/setup.js"
import { ConfigClient } from "./db/clients/config.js"
import { SearchDBClient } from "./db/clients/search.js"

export class AppCtx {
    _db: Database.Database | null
    private _config: AppConfig

    constructor(config: AppConfig) {
        this._config = config
        this._db = null
    }

    get config() {
        return this._config
    }

    getDB() {
        if (this._db) return this._db;

        fs.mkdirSync(path.dirname(this.config.db.dbPath), { recursive: true })
        this._db = new Database(this.config.db.dbPath)
        this._db.pragma("journal_mode = WAL")
        this._db.pragma("foreign_keys = ON")
        ensureMigrationsTable(this._db)
        const conflicts = detectMigrationConflicts(this._db)

        if (conflicts.length > 0) {
            if (this.config.db.onDBSchemaConflict === 'backup-and-overwrite') {
                this._db.close()
                const backupPath = `${this.config.db.dbPath}.${new Date().toISOString().replace(/[:]/g, "-")}.backup`
                fs.renameSync(this.config.db.dbPath, backupPath)

                this._db = new Database(this.config.db.dbPath)
                this._db.pragma("journal_mode = WAL")
                this._db.pragma("foreign_keys = ON")
            } else if (this.config.db.onDBSchemaConflict === 'quit') {
                const details = conflicts
                    .map(
                        (conflict) =>
                            `- ${conflict.name}: applied=${conflict.appliedChecksum}, expected=${conflict.expectedChecksum}`
                    )
                    .join("\n")
                throw new Error(
                    `DB schema conflicts detected. Set YAH_ON_DB_SCHEMA_CONFLICT=backup-and-overwrite to recreate DB.\n${details}`
                )
            }
        }
        runMigrations(this._db)
        return this._db
    }

    get dbClients() {
        const db = this.getDB()
        return {
            config: () => new ConfigClient(db),
            search: () => new SearchDBClient(db)
        }
    }
}
