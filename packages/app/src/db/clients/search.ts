import type Database from "better-sqlite3";
import {
    ArticleDetailPayload,
    ArticleRecord,
    QueryIntentRecord,
    QueryIntentWithArticles,
    QueryRecord,
    QueryResultPayload,
} from "../../type/search.js";

export class SearchDBClient {
    db: Database.Database;

    constructor(db: Database.Database) {
        this.db = db;
    }

    upsertQuery(value: string): QueryRecord {
        const normalizedValue = value.trim()
        if (!normalizedValue) {
            throw new Error("Query value cannot be empty")
        }

        this.db
            .prepare(
                `
                INSERT INTO query (value)
                VALUES (?)
                ON CONFLICT(value) DO NOTHING
                `
            )
            .run(normalizedValue)

        const row = this.db
            .prepare(
                `
                SELECT id, value, created_at
                FROM query
                WHERE value = ?
                `
            )
            .get(normalizedValue) as
            | { id: number; value: string; created_at: string }
            | undefined

        if (!row) {
            throw new Error("Failed to create or fetch query")
        }

        return {
            id: row.id,
            value: row.value,
            createdAt: row.created_at,
        }
    }

    getQueryById(id: number): QueryRecord | null {
        const row = this.db
            .prepare(
                `
                SELECT id, value, created_at
                FROM query
                WHERE id = ?
                `
            )
            .get(id) as { id: number; value: string; created_at: string } | undefined

        if (!row) return null

        return {
            id: row.id,
            value: row.value,
            createdAt: row.created_at,
        }
    }

    upsertIntent(queryId: number, intent: string): QueryIntentRecord {
        const normalizedIntent = intent.trim()
        if (!normalizedIntent) {
            throw new Error("Intent cannot be empty")
        }

        this.db
            .prepare(
                `
                INSERT INTO query_intent (query_id, intent)
                VALUES (?, ?)
                ON CONFLICT(query_id, intent) DO NOTHING
                `
            )
            .run(queryId, normalizedIntent)

        const row = this.db
            .prepare(
                `
                SELECT id, query_id, intent
                FROM query_intent
                WHERE query_id = ? AND intent = ?
                `
            )
            .get(queryId, normalizedIntent) as
            | { id: number; query_id: number; intent: string }
            | undefined

        if (!row) {
            throw new Error("Failed to create or fetch intent")
        }

        return {
            id: row.id,
            queryId: row.query_id,
            intent: row.intent,
        }
    }

    listIntentsByQueryId(queryId: number): QueryIntentRecord[] {
        const rows = this.db
            .prepare(
                `
                SELECT id, query_id, intent
                FROM query_intent
                WHERE query_id = ?
                ORDER BY id ASC
                `
            )
            .all(queryId) as Array<{ id: number; query_id: number; intent: string }>

        return rows.map((row) => ({
            id: row.id,
            queryId: row.query_id,
            intent: row.intent,
        }))
    }

    private toPlainText(markdown: string): string {
        return markdown
            .replace(/```[\s\S]*?```/g, " ")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
            .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
            .replace(/^#{1,6}\s+/gm, "")
            .replace(/^\s*[-*+]\s+/gm, "")
            .replace(/^\s*\d+\.\s+/gm, "")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1")
            .replace(/_([^_]+)_/g, "$1")
            .replace(/~~([^~]+)~~/g, "$1")
            .replace(/^\s*>\s?/gm, "")
    }

    private toSnippet(content: string): string {
        const plainText = this.toPlainText(content)
        const collapsed = plainText.replace(/\s+/g, " ").trim()
        if (collapsed.length <= 360) return collapsed
        return `${collapsed.slice(0, 357)}...`
    }

    private slugExists(slug: string): boolean {
        const row = this.db
            .prepare(
                `
                SELECT id
                FROM article
                WHERE slug = ?
                LIMIT 1
                `
            )
            .get(slug) as { id: number } | undefined

        return Boolean(row)
    }

    private getUniqueSlug(baseSlug: string): string {
        const normalizedBase = baseSlug.trim() || "untitled"
        if (!this.slugExists(normalizedBase)) return normalizedBase

        let index = 2
        while (true) {
            const candidate = `${normalizedBase}-${index}`
            if (!this.slugExists(candidate)) return candidate
            index += 1
        }
    }

    createArticle(args: {
        intentId: number
        title: string
        slug: string
        content: string
    }): ArticleRecord {
        const existing = this.db
            .prepare(
                `
                SELECT id
                FROM article
                WHERE intent_id = ?
                ORDER BY id ASC
                LIMIT 1
                `
            )
            .get(args.intentId) as { id: number } | undefined
        if (existing) {
            return this.getArticleById(existing.id)
        }

        const title = args.title.trim()
        const content = args.content.trim()
        if (!title || !content) {
            throw new Error("Article title and content are required")
        }

        const uniqueSlug = this.getUniqueSlug(args.slug)

        const result = this.db
            .prepare(
                `
                INSERT INTO article (intent_id, title, slug, content)
                VALUES (?, ?, ?, ?)
                `
            )
            .run(args.intentId, title, uniqueSlug, content)

        return this.getArticleById(result.lastInsertRowid as number)
    }

    private getArticleById(id: number): ArticleRecord {
        const row = this.db
            .prepare(
                `
                SELECT id, intent_id, title, slug, content, created_at
                FROM article
                WHERE id = ?
                `
            )
            .get(id) as
            | {
                  id: number
                  intent_id: number
                  title: string
                  slug: string
                  content: string
                  created_at: string
              }
            | undefined

        if (!row) {
            throw new Error("Inserted article not found")
        }

        return {
            id: row.id,
            intentId: row.intent_id,
            title: row.title,
            slug: row.slug,
            content: row.content,
            createdAt: row.created_at,
        }
    }

    getQueryResult(queryId: number): QueryResultPayload | null {
        const query = this.getQueryById(queryId)
        if (!query) return null

        const intentRows = this.listIntentsByQueryId(queryId)
        const intents: QueryIntentWithArticles[] = intentRows.map((intentRow) => {
            const articleRows = this.db
                .prepare(
                    `
                    SELECT id, title, slug, content, created_at
                    FROM article
                    WHERE intent_id = ?
                    ORDER BY id ASC
                    `
                )
                .all(intentRow.id) as Array<{
                id: number
                title: string
                slug: string
                content: string
                created_at: string
            }>

            return {
                id: intentRow.id,
                intent: intentRow.intent,
                articles: articleRows.map((article) => ({
                    id: article.id,
                    title: article.title,
                    slug: article.slug,
                    snippet: this.toSnippet(article.content),
                    createdAt: article.created_at,
                })),
            }
        })

        return {
            query,
            intents,
        }
    }

    getArticleDetailBySlug(slug: string): ArticleDetailPayload | null {
        const row = this.db
            .prepare(
                `
                SELECT
                    a.id AS article_id,
                    a.intent_id AS article_intent_id,
                    a.title AS article_title,
                    a.slug AS article_slug,
                    a.content AS article_content,
                    a.created_at AS article_created_at,
                    qi.id AS intent_id,
                    qi.intent AS intent_value,
                    qi.query_id AS query_id,
                    q.value AS query_value,
                    q.created_at AS query_created_at
                FROM article a
                JOIN query_intent qi ON qi.id = a.intent_id
                JOIN query q ON q.id = qi.query_id
                WHERE a.slug = ?
                `
            )
            .get(slug) as
            | {
                  article_id: number
                  article_intent_id: number
                  article_title: string
                  article_slug: string
                  article_content: string
                  article_created_at: string
                  intent_id: number
                  intent_value: string
                  query_id: number
                  query_value: string
                  query_created_at: string
              }
            | undefined

        if (!row) return null

        const relatedRows = this.db
            .prepare(
                `
                SELECT id, intent
                FROM query_intent
                WHERE query_id = ? AND id != ?
                ORDER BY id ASC
                `
            )
            .all(row.query_id, row.intent_id) as Array<{ id: number; intent: string }>

        return {
            article: {
                id: row.article_id,
                intentId: row.article_intent_id,
                title: row.article_title,
                slug: row.article_slug,
                content: row.article_content,
                createdAt: row.article_created_at,
            },
            intent: {
                id: row.intent_id,
                queryId: row.query_id,
                intent: row.intent_value,
            },
            query: {
                id: row.query_id,
                value: row.query_value,
                createdAt: row.query_created_at,
            },
            relatedIntents: relatedRows.map((relatedRow) => ({
                id: relatedRow.id,
                intent: relatedRow.intent,
            })),
        }
    }

    hasGeneratedContent(queryId: number): boolean {
        const row = this.db
            .prepare(
                `
                SELECT qi.id
                FROM query_intent qi
                LEFT JOIN article a ON a.intent_id = qi.id
                WHERE qi.query_id = ?
                LIMIT 1
                `
            )
            .get(queryId) as { id: number } | undefined

        return Boolean(row)
    }
}
