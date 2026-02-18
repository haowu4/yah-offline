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
            intent_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (intent_id) REFERENCES query_intent(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_article_intent_id ON article(intent_id);
        `,
    },
    {
        name: "002_article_slug",
        sql: `
        ALTER TABLE article ADD COLUMN slug TEXT;

        UPDATE article
        SET slug = lower(trim(replace(title, ' ', '-')))
        WHERE slug IS NULL OR slug = '';

        CREATE UNIQUE INDEX IF NOT EXISTS idx_article_slug_unique ON article(slug);
        `,
    },
    {
        name: "003_mail_v2",
        sql: `
        DROP TABLE IF EXISTS file_attachment;
        DROP TABLE IF EXISTS mail_message;
        DROP TABLE IF EXISTS mail_thread;
        DROP TABLE IF EXISTS contact;

        CREATE TABLE IF NOT EXISTS mail_contact (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            instruction TEXT NOT NULL DEFAULT '',
            icon TEXT NOT NULL DEFAULT 'user',
            color TEXT NOT NULL DEFAULT '#6b7280',
            default_model TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS mail_thread (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_uid TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS mail_reply (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
            contact_id INTEGER,
            model TEXT,
            content TEXT NOT NULL DEFAULT '',
            unread INTEGER NOT NULL DEFAULT 0 CHECK (unread IN (0, 1)),
            token_count INTEGER,
            status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'streaming', 'completed', 'error')),
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (thread_id) REFERENCES mail_thread(id) ON DELETE CASCADE,
            FOREIGN KEY (contact_id) REFERENCES mail_contact(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mail_reply_thread_id ON mail_reply(thread_id);
        CREATE INDEX IF NOT EXISTS idx_mail_reply_contact_id ON mail_reply(contact_id);
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

        CREATE TABLE IF NOT EXISTS mail_thread_contact_context (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL,
            contact_id INTEGER NOT NULL,
            summary_text TEXT NOT NULL DEFAULT '',
            summary_token_count INTEGER NOT NULL DEFAULT 0,
            last_summarized_reply_id INTEGER,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (thread_id) REFERENCES mail_thread(id) ON DELETE CASCADE,
            FOREIGN KEY (contact_id) REFERENCES mail_contact(id) ON DELETE CASCADE,
            FOREIGN KEY (last_summarized_reply_id) REFERENCES mail_reply(id) ON DELETE SET NULL,
            UNIQUE (thread_id, contact_id)
        );

        CREATE TABLE IF NOT EXISTS mail_job (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL,
            user_reply_id INTEGER NOT NULL,
            requested_contact_id INTEGER,
            requested_model TEXT,
            status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
            error_message TEXT,
            run_after TEXT NOT NULL DEFAULT (datetime('now')),
            started_at TEXT,
            finished_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (thread_id) REFERENCES mail_thread(id) ON DELETE CASCADE,
            FOREIGN KEY (user_reply_id) REFERENCES mail_reply(id) ON DELETE CASCADE,
            FOREIGN KEY (requested_contact_id) REFERENCES mail_contact(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mail_job_status_run_after ON mail_job(status, run_after);

        CREATE TABLE IF NOT EXISTS mail_event (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        `,
    },
    {
        name: "004_mail_contact_icon_location",
        sql: `
        ALTER TABLE mail_contact ADD COLUMN icon_location TEXT;

        UPDATE mail_contact
        SET icon_location = printf('%d-%s.png', id, slug)
        WHERE icon_location IS NULL OR trim(icon_location) = '';
        `,
    },
]
