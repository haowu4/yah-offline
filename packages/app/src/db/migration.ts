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
            value TEXT NOT NULL
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

        CREATE TABLE IF NOT EXISTS contact (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            instruction TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS mail_thread (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            context TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS mail_message (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL,
            who TEXT NOT NULL CHECK (who IN ('user', 'assistant')),
            contact_id INTEGER,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (thread_id) REFERENCES mail_thread(id) ON DELETE CASCADE,
            FOREIGN KEY (contact_id) REFERENCES contact(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mail_message_thread_id ON mail_message(thread_id);
        CREATE INDEX IF NOT EXISTS idx_mail_message_contact_id ON mail_message(contact_id);

        CREATE TABLE IF NOT EXISTS file_attachment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mail_message_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL CHECK (file_type IN ('text', 'image')),
            content BLOB NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (mail_message_id) REFERENCES mail_message(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_file_attachment_mail_message_id ON file_attachment(mail_message_id);

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
]
