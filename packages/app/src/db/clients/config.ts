import type Database from "better-sqlite3";

export type ConfigItem = {
    key: string
    value: string
    description: string
}

type ConfigRow = {
    key: string
    value: string
    description: string | null
}

export class ConfigClient {
    db: Database.Database;

    constructor(db: Database.Database) {
        this.db = db;
    }

    private normalizeKey(key: string): string {
        return key.trim().toLowerCase()
    }

    private toConfigItem(row: ConfigRow): ConfigItem {
        return {
            key: row.key,
            value: row.value,
            description: row.description ?? "",
        }
    }

    listConfigs(): ConfigItem[] {
        const rows = this.db
            .prepare(
                `
                SELECT key, value, description
                FROM config_value
                ORDER BY key ASC
                `
            )
            .all() as ConfigRow[]
        return rows.map((row) => this.toConfigItem(row))
    }

    createConfig(args: { key: string; value: string; description?: string }): ConfigItem {
        const normalizedKey = this.normalizeKey(args.key)
        this.db
            .prepare(
                `
                INSERT INTO config_value (key, value, description)
                VALUES (?, ?, ?)
                `
            )
            .run(normalizedKey, args.value, args.description ?? "")

        return {
            key: normalizedKey,
            value: args.value,
            description: args.description ?? "",
        }
    }

    updateConfig(
        key: string,
        args: { value: string; description?: string }
    ): ConfigItem | null {
        const normalizedKey = this.normalizeKey(key)
        const result = this.db
            .prepare(
                `
                UPDATE config_value
                SET value = ?, description = ?
                WHERE key = ?
                `
            )
            .run(args.value, args.description ?? "", normalizedKey)

        if (result.changes === 0) return null

        return {
            key: normalizedKey,
            value: args.value,
            description: args.description ?? "",
        }
    }

    deleteConfig(key: string): boolean {
        const normalizedKey = this.normalizeKey(key)
        const result = this.db
            .prepare("DELETE FROM config_value WHERE key = ?")
            .run(normalizedKey)
        return result.changes > 0
    }

    getValue(key: string): string | null {
        const normalizedKey = this.normalizeKey(key)
        const row = this.db
            .prepare("SELECT value FROM config_value WHERE key = ?")
            .get(normalizedKey) as { value: string } | undefined
        return row?.value ?? null
    }

    setValue(key: string, value: string): void {
        const normalizedKey = this.normalizeKey(key)
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
