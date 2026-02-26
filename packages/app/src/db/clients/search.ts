import type Database from "better-sqlite3";
import {
    ArticleDetailPayload,
    ArticleRecord,
    QueryIntentRecord,
    QueryIntentWithArticles,
    QueryRecord,
    QueryResultPayload,
    SearchRecentQueryItem,
} from "../../type/search.js";

export class SearchDBClient {
    db: Database.Database;

    constructor(db: Database.Database) {
        this.db = db;
    }

    upsertQuery(args: {
        value: string
        language: string
        originalValue?: string | null
    }): QueryRecord {
        const normalizedValue = args.value.trim()
        if (!normalizedValue) {
            throw new Error("Query value cannot be empty")
        }

        const language = args.language.trim()
        if (!language || language.toLowerCase() === "auto") {
            throw new Error("Query language must be a valid language code")
        }
        const originalValue = args.originalValue?.trim() || null

        this.db
            .prepare(
                `
                INSERT INTO query (value, language, original_value)
                VALUES (?, ?, ?)
                ON CONFLICT(value, language) DO NOTHING
                `
            )
            .run(normalizedValue, language, originalValue)

        const row = this.db
            .prepare(
                `
                SELECT id, value, language, original_value, created_at
                FROM query
                WHERE value = ? AND language = ?
                `
            )
            .get(normalizedValue, language) as
            | { id: number; value: string; language: string; original_value: string | null; created_at: string }
            | undefined

        if (!row) {
            throw new Error("Failed to create or fetch query")
        }

        return {
            id: row.id,
            value: row.value,
            language: row.language,
            originalValue: row.original_value,
            createdAt: row.created_at,
        }
    }

    getQueryById(id: number): QueryRecord | null {
        const row = this.db
            .prepare(
                `
                SELECT id, value, language, original_value, created_at
                FROM query
                WHERE id = ?
                `
            )
            .get(id) as
            | { id: number; value: string; language: string; original_value: string | null; created_at: string }
            | undefined

        if (!row) return null

        return {
            id: row.id,
            value: row.value,
            language: row.language,
            originalValue: row.original_value,
            createdAt: row.created_at,
        }
    }

    getSpellCorrection(args: {
        sourceText: string
        language: string
        provider: string
    }): { correctedText: string } | null {
        const sourceText = args.sourceText.trim()
        if (!sourceText) return null

        const row = this.db
            .prepare(
                `
                SELECT id, corrected_text
                FROM search_spell_cache
                WHERE source_text = ? AND language = ? AND provider = ?
                `
            )
            .get(sourceText, args.language, args.provider) as
            | { id: number; corrected_text: string }
            | undefined

        if (!row) return null

        this.db
            .prepare(
                `
                UPDATE search_spell_cache
                SET hit_count = hit_count + 1,
                    updated_at = datetime('now')
                WHERE id = ?
                `
            )
            .run(row.id)

        return {
            correctedText: row.corrected_text,
        }
    }

    upsertSpellCorrection(args: {
        sourceText: string
        language: string
        provider: string
        correctedText: string
    }): void {
        const sourceText = args.sourceText.trim()
        const correctedText = args.correctedText.trim()
        if (!sourceText || !correctedText) return

        this.db
            .prepare(
                `
                INSERT INTO search_spell_cache (source_text, language, corrected_text, provider, hit_count)
                VALUES (?, ?, ?, ?, 1)
                ON CONFLICT(source_text, language, provider)
                DO UPDATE SET
                  corrected_text = excluded.corrected_text,
                  hit_count = search_spell_cache.hit_count + 1,
                  updated_at = datetime('now')
                `
            )
            .run(sourceText, args.language, correctedText, args.provider)
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
        intentId?: number | null
        title: string
        slug: string
        content: string
    }): ArticleRecord {
        const intentId = args.intentId ?? null
        if (intentId !== null) {
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
                .get(intentId) as { id: number } | undefined
            if (existing) {
                return this.getArticleById(existing.id)
            }
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
            .run(intentId, title, uniqueSlug, content)

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
                  intent_id: number | null
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
                    q.language AS query_language,
                    q.original_value AS query_original_value,
                    q.created_at AS query_created_at
                FROM article a
                LEFT JOIN query_intent qi ON qi.id = a.intent_id
                LEFT JOIN query q ON q.id = qi.query_id
                WHERE a.slug = ?
                `
            )
            .get(slug) as
            | {
                  article_id: number
                  article_intent_id: number | null
                  article_title: string
                  article_slug: string
                  article_content: string
                  article_created_at: string
                  intent_id: number | null
                  intent_value: string | null
                  query_id: number | null
                  query_value: string | null
                  query_language: string | null
                  query_original_value: string | null
                  query_created_at: string | null
              }
            | undefined

        if (!row) return null

        const relatedRows =
            row.query_id !== null && row.intent_id !== null
                ? (this.db
                      .prepare(
                          `
                          SELECT id, intent
                          FROM query_intent
                          WHERE query_id = ? AND id != ?
                          ORDER BY id ASC
                          `
                      )
                      .all(row.query_id, row.intent_id) as Array<{
                      id: number
                      intent: string
                  }>)
                : []

        const payload: ArticleDetailPayload = {
            article: {
                id: row.article_id,
                intentId: row.article_intent_id,
                title: row.article_title,
                slug: row.article_slug,
                content: row.article_content,
                createdAt: row.article_created_at,
            },
            relatedIntents: relatedRows.map((relatedRow) => ({
                id: relatedRow.id,
                intent: relatedRow.intent,
            })),
        }

        if (row.intent_id !== null && row.query_id !== null && row.intent_value !== null) {
            payload.intent = {
                id: row.intent_id,
                queryId: row.query_id,
                intent: row.intent_value,
            }
        }

        if (
            row.query_id !== null &&
            row.query_value !== null &&
            row.query_created_at !== null &&
            row.query_language !== null
        ) {
            payload.query = {
                id: row.query_id,
                value: row.query_value,
                language: row.query_language,
                originalValue: row.query_original_value,
                createdAt: row.query_created_at,
            }
        }

        return payload
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

    createQueryHistory(args: {
        queryText: string
        language: string
        queryId?: number | null
        dedupeWindowSeconds?: number
    }): void {
        const queryText = args.queryText.trim()
        const language = args.language.trim()
        if (!queryText || !language) return
        const dedupeWindowSeconds = Number.isInteger(args.dedupeWindowSeconds) && (args.dedupeWindowSeconds ?? 0) > 0
            ? (args.dedupeWindowSeconds as number)
            : 300

        const recentDuplicate = this.db
            .prepare(
                `
                SELECT id
                FROM query_history
                WHERE lower(query_text) = lower(?)
                  AND language = ?
                  AND created_at >= datetime('now', ?)
                ORDER BY id DESC
                LIMIT 1
                `
            )
            .get(queryText, language, `-${dedupeWindowSeconds} seconds`) as { id: number } | undefined
        if (recentDuplicate) return

        this.db
            .prepare(
                `
                INSERT INTO query_history (query_text, language, query_id)
                VALUES (?, ?, ?)
                `
            )
            .run(queryText, language, args.queryId ?? null)
    }

    listRecentQueries(limit: number): SearchRecentQueryItem[] {
        const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 8
        const rows = this.db
            .prepare(
                `
                SELECT
                    query_text AS value,
                    language,
                    MAX(created_at) AS last_searched_at
                FROM query_history
                GROUP BY query_text, language
                ORDER BY last_searched_at DESC
                LIMIT ?
                `
            )
            .all(safeLimit) as Array<{
            value: string
            language: string
            last_searched_at: string
        }>

        return rows.map((row) => ({
            value: row.value,
            language: row.language,
            lastSearchedAt: row.last_searched_at,
        }))
    }

    getQueryHistoryCount(): number {
        const row = this.db
            .prepare(
                `
                SELECT COUNT(*) AS count
                FROM query_history
                `
            )
            .get() as { count: number } | undefined
        return row?.count ?? 0
    }
}
