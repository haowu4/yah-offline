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
            value TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS query_intent (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_id INTEGER NOT NULL,
            intent TEXT NOT NULL,
            FOREIGN KEY (query_id) REFERENCES query(id) ON DELETE CASCADE,
            UNIQUE (query_id, intent)
        );
        CREATE INDEX IF NOT EXISTS idx_query_intent_query_id ON query_intent(query_id);

        CREATE TABLE IF NOT EXISTS article (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            intent_id INTEGER,
            title TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (intent_id) REFERENCES query_intent(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_article_intent_id ON article(intent_id);
        `,
    },
    {
        name: "002_article_slug",
        sql: `
        -- no-op: slug is created in 001_init for fresh databases
        `,
    },
    {
        name: "003_mail_v2",
        sql: `
        DROP TABLE IF EXISTS file_attachment;
        DROP TABLE IF EXISTS mail_message;
        DROP TABLE IF EXISTS mail_thread;
        DROP TABLE IF EXISTS contact;
        DROP TABLE IF EXISTS mail_contact;
        DROP TABLE IF EXISTS mail_thread_contact_context;
        DROP TABLE IF EXISTS mail_search_fts;

        CREATE TABLE IF NOT EXISTS mail_thread (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_uid TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL DEFAULT '',
            user_set_title INTEGER NOT NULL DEFAULT 0 CHECK (user_set_title IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS mail_reply (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
            model TEXT,
            content TEXT NOT NULL DEFAULT '',
            unread INTEGER NOT NULL DEFAULT 0 CHECK (unread IN (0, 1)),
            token_count INTEGER,
            status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'streaming', 'completed', 'error')),
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (thread_id) REFERENCES mail_thread(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_mail_reply_thread_id ON mail_reply(thread_id);
        CREATE INDEX IF NOT EXISTS idx_mail_reply_unread ON mail_reply(unread);
        CREATE INDEX IF NOT EXISTS idx_mail_reply_created_at ON mail_reply(created_at);

        CREATE TABLE IF NOT EXISTS mail_attachment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reply_id INTEGER NOT NULL,
            slug TEXT NOT NULL,
            filename TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('text', 'image')),
            mime_type TEXT NOT NULL,
            text_content TEXT,
            binary_content BLOB,
            tool_name TEXT,
            model_quality TEXT CHECK (model_quality IN ('low', 'normal', 'high')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (reply_id) REFERENCES mail_reply(id) ON DELETE CASCADE,
            UNIQUE (reply_id, slug)
        );
        CREATE INDEX IF NOT EXISTS idx_mail_attachment_reply_id ON mail_attachment(reply_id);

        CREATE TABLE IF NOT EXISTS mail_thread_context (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL,
            summary_text TEXT NOT NULL DEFAULT '',
            summary_token_count INTEGER NOT NULL DEFAULT 0,
            last_summarized_reply_id INTEGER,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (thread_id) REFERENCES mail_thread(id) ON DELETE CASCADE,
            FOREIGN KEY (last_summarized_reply_id) REFERENCES mail_reply(id) ON DELETE SET NULL,
            UNIQUE (thread_id)
        );

        CREATE TABLE IF NOT EXISTS llm_job (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL CHECK (kind IN ('mail.reply', 'search.generate')),
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
            topic TEXT NOT NULL CHECK (topic IN ('mail', 'search.query')),
            entity_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_llm_event_topic_entity_id ON llm_event(topic, entity_id, id);

        CREATE VIRTUAL TABLE IF NOT EXISTS mail_search_fts USING fts5(
            thread_id UNINDEXED,
            kind UNINDEXED,
            source_id UNINDEXED,
            content
        );

        INSERT INTO mail_search_fts (thread_id, kind, source_id, content)
        SELECT id, 'thread', id, COALESCE(title, '')
        FROM mail_thread;

        INSERT INTO mail_search_fts (thread_id, kind, source_id, content)
        SELECT thread_id, 'reply', id, COALESCE(content, '')
        FROM mail_reply;

        INSERT INTO mail_search_fts (thread_id, kind, source_id, content)
        SELECT
            r.thread_id,
            'attachment',
            a.id,
            trim(COALESCE(a.filename, '') || ' ' || COALESCE(a.text_content, ''))
        FROM mail_attachment a
        JOIN mail_reply r ON r.id = a.reply_id;

        CREATE TRIGGER IF NOT EXISTS trg_mail_search_thread_insert
        AFTER INSERT ON mail_thread
        BEGIN
            INSERT INTO mail_search_fts (thread_id, kind, source_id, content)
            VALUES (new.id, 'thread', new.id, COALESCE(new.title, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS trg_mail_search_thread_update
        AFTER UPDATE OF title ON mail_thread
        BEGIN
            UPDATE mail_search_fts
            SET content = COALESCE(new.title, '')
            WHERE kind = 'thread' AND source_id = new.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_mail_search_thread_delete
        AFTER DELETE ON mail_thread
        BEGIN
            DELETE FROM mail_search_fts
            WHERE kind = 'thread' AND source_id = old.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_mail_search_reply_insert
        AFTER INSERT ON mail_reply
        BEGIN
            INSERT INTO mail_search_fts (thread_id, kind, source_id, content)
            VALUES (new.thread_id, 'reply', new.id, COALESCE(new.content, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS trg_mail_search_reply_update
        AFTER UPDATE OF thread_id, content ON mail_reply
        BEGIN
            UPDATE mail_search_fts
            SET thread_id = new.thread_id,
                content = COALESCE(new.content, '')
            WHERE kind = 'reply' AND source_id = new.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_mail_search_reply_delete
        AFTER DELETE ON mail_reply
        BEGIN
            DELETE FROM mail_search_fts
            WHERE kind = 'reply' AND source_id = old.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_mail_search_attachment_insert
        AFTER INSERT ON mail_attachment
        BEGIN
            INSERT INTO mail_search_fts (thread_id, kind, source_id, content)
            VALUES (
                (SELECT thread_id FROM mail_reply WHERE id = new.reply_id),
                'attachment',
                new.id,
                trim(COALESCE(new.filename, '') || ' ' || COALESCE(new.text_content, ''))
            );
        END;

        CREATE TRIGGER IF NOT EXISTS trg_mail_search_attachment_update
        AFTER UPDATE OF reply_id, filename, text_content ON mail_attachment
        BEGIN
            UPDATE mail_search_fts
            SET thread_id = (SELECT thread_id FROM mail_reply WHERE id = new.reply_id),
                content = trim(COALESCE(new.filename, '') || ' ' || COALESCE(new.text_content, ''))
            WHERE kind = 'attachment' AND source_id = new.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_mail_search_attachment_delete
        AFTER DELETE ON mail_attachment
        BEGIN
            DELETE FROM mail_search_fts
            WHERE kind = 'attachment' AND source_id = old.id;
        END;
        `,
    },
    {
        name: "004_mail_contact_icon_location",
        sql: `
        -- no-op: contact support removed
        `,
    },
    {
        name: "005_search_language_spell_cache",
        sql: `
        CREATE TABLE IF NOT EXISTS query_next (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            value TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'auto',
            original_value TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (value, language)
        );

        INSERT INTO query_next (id, value, language, original_value, created_at)
        SELECT id, value, 'auto', value, created_at
        FROM query;

        DROP TABLE IF EXISTS query;
        ALTER TABLE query_next RENAME TO query;

        CREATE TABLE IF NOT EXISTS search_spell_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_text TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'auto',
            corrected_text TEXT NOT NULL,
            provider TEXT NOT NULL,
            hit_count INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (source_text, language, provider)
        );
        CREATE INDEX IF NOT EXISTS idx_search_spell_cache_source_lang_provider
          ON search_spell_cache(source_text, language, provider);
        `,
    },
    {
        name: "006_search_query_history_and_language_en",
        sql: `
        CREATE TABLE IF NOT EXISTS query_next2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            value TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'en',
            original_value TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (value, language)
        );

        INSERT INTO query_next2 (id, value, language, original_value, created_at)
        SELECT
            id,
            value,
            CASE
                WHEN language IS NULL OR trim(language) = '' OR lower(language) = 'auto' THEN 'en'
                ELSE language
            END,
            original_value,
            created_at
        FROM query;

        DROP TABLE IF EXISTS query;
        ALTER TABLE query_next2 RENAME TO query;

        DROP TABLE IF EXISTS search_spell_cache;
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
        `,
    },
    {
        name: "007_config_key_renames_for_llm",
        sql: `
        INSERT INTO config_value (key, value, description)
        SELECT 'llm.models', value, description
        FROM config_value
        WHERE key = 'chat.models'
        ON CONFLICT(key) DO NOTHING;

        DELETE FROM config_value
        WHERE key = 'chat.models';

        INSERT INTO config_value (key, value, description)
        SELECT 'llm.baseurl', value, description
        FROM config_value
        WHERE key = 'search.openai.base_url'
        ON CONFLICT(key) DO NOTHING;

        DELETE FROM config_value
        WHERE key = 'search.openai.base_url';
        `,
    },
]
