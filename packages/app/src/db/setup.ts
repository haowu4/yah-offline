import Database from "better-sqlite3"
import { createHash } from "node:crypto"
import { migrations } from "./migration.js"
import { DefaultConfigs } from "./configs.js"

type MigrationConflict = {
    name: string
    appliedChecksum: string
    expectedChecksum: string
}

function getMigrationChecksum(sql: string): string {
    return createHash("sha256").update(sql).digest("hex")
}
/**
 * add default config into the db. skip any key that is already there.
 * 
 * the default config entries is defined in `import { DefaultConfigs } from "./configs.js"`
 * 
 * @param db 
 */
export function addDefaultConfigs(db: Database.Database) {
    const insert = db.prepare(
        `
        INSERT INTO config_value (key, value, description)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO NOTHING
        `
    )

    const tx = db.transaction(() => {
        for (const item of DefaultConfigs) {
            const normalizedKey = item.key.trim().toLowerCase()
            if (!normalizedKey) continue
            insert.run(normalizedKey, item.value, item.description ?? "")
        }
    })

    tx()
}

export function ensureMigrationsTable(db: Database.Database) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT,
      run_at TEXT NOT NULL
    )
  `)

    const hasChecksumColumn = db
        .prepare(`PRAGMA table_info('_migrations')`)
        .all()
        .some((column: any) => column.name === "checksum")

    if (!hasChecksumColumn) {
        db.exec(`ALTER TABLE _migrations ADD COLUMN checksum TEXT`)
    }
}

export function detectMigrationConflicts(
    db: Database.Database
): MigrationConflict[] {
    ensureMigrationsTable(db)

    const expectedChecksums = new Map(
        migrations.map((migration) => [
            migration.name,
            getMigrationChecksum(migration.sql),
        ])
    )

    const applied = db
        .prepare("SELECT name, checksum FROM _migrations")
        .all() as Array<{ name: string; checksum: string | null }>

    const conflicts: MigrationConflict[] = []
    for (const row of applied) {
        if (!row.checksum) continue

        const expectedChecksum = expectedChecksums.get(row.name)
        if (!expectedChecksum) continue

        if (row.checksum !== expectedChecksum) {
            conflicts.push({
                name: row.name,
                appliedChecksum: row.checksum,
                expectedChecksum,
            })
        }
    }

    return conflicts
}

export function runMigrations(db: Database.Database) {
    ensureMigrationsTable(db)

    const conflicts = detectMigrationConflicts(db)
    if (conflicts.length > 0) {
        const details = conflicts
            .map(
                (conflict) =>
                    `- ${conflict.name}: applied=${conflict.appliedChecksum}, expected=${conflict.expectedChecksum}`
            )
            .join("\n")
        throw new Error(`Migration conflict detected:\n${details}`)
    }

    const applied = new Map(
        (
            db.prepare("SELECT name, checksum FROM _migrations").all() as Array<{
                name: string
                checksum: string | null
            }>
        ).map((r) => [r.name, r.checksum])
    )

    for (const migration of migrations) {
        const checksum = getMigrationChecksum(migration.sql)
        if (applied.has(migration.name)) {
            if (!applied.get(migration.name)) {
                db.prepare(
                    "UPDATE _migrations SET checksum = ? WHERE name = ?"
                ).run(checksum, migration.name)
            }
            continue
        }

        const tx = db.transaction(() => {
            db.exec(migration.sql)
            db.prepare(
                "INSERT INTO _migrations (name, checksum, run_at) VALUES (?, ?, datetime('now'))"
            ).run(migration.name, checksum)
        })

        tx()

        console.log("Applied migration:", migration.name)
    }
}
