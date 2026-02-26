import type Database from "better-sqlite3"

type Migration = {
    name: string
    sql: string
}

export const migrations: Migration[] = [
    {
        name: "001_init",
        sql: `
        CREATE TABLE IF NOT EXISTS config_value (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL COLLATE NOCASE UNIQUE,
            value TEXT NOT NULL,
            description TEXT
        );

        CREATE TABLE IF NOT EXISTS query (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            value TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'en',
            original_value TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (value, language)
        );

        CREATE TABLE IF NOT EXISTS query_intent (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            intent TEXT NOT NULL,
            UNIQUE (intent)
        );
        CREATE INDEX IF NOT EXISTS idx_query_intent_intent ON query_intent(intent);

        CREATE TABLE IF NOT EXISTS query_query_intent (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_id INTEGER NOT NULL,
            intent_id INTEGER NOT NULL,
            FOREIGN KEY (query_id) REFERENCES query(id) ON DELETE CASCADE,
            FOREIGN KEY (intent_id) REFERENCES query_intent(id) ON DELETE CASCADE,
            UNIQUE (query_id, intent_id)
        );
        CREATE INDEX IF NOT EXISTS idx_query_query_intent_query_id ON query_query_intent(query_id);
        CREATE INDEX IF NOT EXISTS idx_query_query_intent_intent_id ON query_query_intent(intent_id);

        CREATE TABLE IF NOT EXISTS article (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS query_intent_article (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            intent_id INTEGER NOT NULL,
            article_id INTEGER NOT NULL,
            FOREIGN KEY (intent_id) REFERENCES query_intent(id) ON DELETE CASCADE,
            FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE CASCADE,
            UNIQUE (intent_id, article_id)
        );
        CREATE INDEX IF NOT EXISTS idx_query_intent_article_intent_id ON query_intent_article(intent_id);
        CREATE INDEX IF NOT EXISTS idx_query_intent_article_article_id ON query_intent_article(article_id);

        CREATE TABLE IF NOT EXISTS search_spell_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_text TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'en',
            corrected_text TEXT NOT NULL,
            provider TEXT NOT NULL,
            hit_count INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (source_text, language, provider)
        );
        CREATE INDEX IF NOT EXISTS idx_search_spell_cache_source_lang_provider
          ON search_spell_cache(source_text, language, provider);

        CREATE TABLE IF NOT EXISTS query_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_text TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'en',
            query_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (query_id) REFERENCES query(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_query_history_created_at ON query_history(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_query_history_query_text_lang ON query_history(query_text, language);

        CREATE TABLE IF NOT EXISTS llm_job (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL CHECK (kind IN ('search.generate')),
            entity_id TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
            priority INTEGER NOT NULL DEFAULT 100,
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            error_message TEXT,
            run_after TEXT NOT NULL DEFAULT (datetime('now')),
            started_at TEXT,
            finished_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_llm_job_status_run_after_priority ON llm_job(status, run_after, priority, id);
        CREATE INDEX IF NOT EXISTS idx_llm_job_entity ON llm_job(kind, entity_id, status);

        CREATE TABLE IF NOT EXISTS llm_event (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic TEXT NOT NULL CHECK (topic IN ('search.query')),
            entity_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_llm_event_topic_entity_id ON llm_event(topic, entity_id, id);
        `,
    },
]

export function getMigrationByName(name: string): Migration | undefined {
    return migrations.find((m) => m.name === name)
}

export function hasMigration(name: string): boolean {
    return Boolean(getMigrationByName(name))
}

export function listMigrationNames(): string[] {
    return migrations.map((m) => m.name)
}

export function listMigrationSQL(name: string): string | null {
    return getMigrationByName(name)?.sql ?? null
}

export function applyMigration(db: Database.Database, name: string): void {
    const migration = getMigrationByName(name)
    if (!migration) {
        throw new Error(`Migration not found: ${name}`)
    }
    db.exec(migration.sql)
}
