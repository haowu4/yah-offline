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

        CREATE TABLE IF NOT EXISTS generation_order (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_id INTEGER NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('query_full', 'intent_regen', 'article_regen_keep_title')),
            intent_id INTEGER,
            status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
            requested_by TEXT NOT NULL DEFAULT 'user' CHECK (requested_by IN ('user', 'system')),
            request_payload_json TEXT NOT NULL DEFAULT '{}',
            result_summary_json TEXT,
            error_message TEXT,
            started_at TEXT,
            finished_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (query_id) REFERENCES query(id) ON DELETE CASCADE,
            FOREIGN KEY (intent_id) REFERENCES query_intent(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_generation_order_status_created ON generation_order(status, created_at, id);
        CREATE INDEX IF NOT EXISTS idx_generation_order_query_status ON generation_order(query_id, status, id);
        CREATE INDEX IF NOT EXISTS idx_generation_order_intent_status ON generation_order(intent_id, status, id);

        CREATE TABLE IF NOT EXISTS generation_event (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (order_id) REFERENCES generation_order(id) ON DELETE CASCADE,
            UNIQUE (order_id, seq)
        );
        CREATE INDEX IF NOT EXISTS idx_generation_event_order_seq ON generation_event(order_id, seq);

        CREATE TABLE IF NOT EXISTS generation_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            stage TEXT NOT NULL CHECK (stage IN ('order', 'spell', 'intent', 'article')),
            level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
            message TEXT NOT NULL,
            meta_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (order_id) REFERENCES generation_order(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_generation_log_order_created ON generation_log(order_id, created_at, id);

        CREATE TABLE IF NOT EXISTS generation_lock (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope_type TEXT NOT NULL CHECK (scope_type IN ('query', 'intent')),
            scope_key TEXT NOT NULL,
            owner_order_id INTEGER NOT NULL,
            lease_expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (owner_order_id) REFERENCES generation_order(id) ON DELETE CASCADE,
            UNIQUE (scope_type, scope_key)
        );
        CREATE INDEX IF NOT EXISTS idx_generation_lock_owner ON generation_lock(owner_order_id);

        CREATE TABLE IF NOT EXISTS llm_failure (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            component TEXT NOT NULL,
            trigger TEXT NOT NULL,
            model TEXT,
            query_id INTEGER,
            intent_id INTEGER,
            order_id INTEGER,
            query_text TEXT,
            intent_text TEXT,
            call_id TEXT,
            attempt INTEGER,
            duration_ms INTEGER,
            error_name TEXT NOT NULL,
            error_message TEXT NOT NULL,
            details_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (query_id) REFERENCES query(id) ON DELETE SET NULL,
            FOREIGN KEY (intent_id) REFERENCES query_intent(id) ON DELETE SET NULL,
            FOREIGN KEY (order_id) REFERENCES generation_order(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_llm_failure_created ON llm_failure(created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_llm_failure_provider_trigger ON llm_failure(provider, trigger, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_llm_failure_order ON llm_failure(order_id, created_at DESC);
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
