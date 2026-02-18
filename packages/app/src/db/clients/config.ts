import type Database from "better-sqlite3";

export type ConfigItem = {
    key: string
    value: string
    description: string
}

export class ConfigClient {
    db: Database.Database;

    constructor(db: Database.Database) {
        this.db = db;
    }

    listConfigs(): Promise<ConfigItem[]> {
        throw new Error('not implemented')
    }

    getValue(key: string): string | null {
        const normalizedKey = key.trim().toLowerCase()
        const row = this.db
            .prepare("SELECT value FROM config_value WHERE key = ?")
            .get(normalizedKey) as { value: string } | undefined
        return row?.value ?? null
    }

    setValue(key: string, value: string): void {
        const normalizedKey = key.trim().toLowerCase()
        this.db
            .prepare(
                `
                INSERT INTO config_value (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                `
            )
            .run(normalizedKey, value)
    }

}
