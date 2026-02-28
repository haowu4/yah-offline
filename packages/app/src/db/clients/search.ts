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
import {
    GenerationOrderEvent,
    GenerationOrderKind,
    GenerationOrderLogLevel,
    GenerationOrderLogRecord,
    GenerationOrderRecord,
    GenerationOrderStatus,
} from "../../type/order.js";

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

    getQueryByValueAndLanguage(value: string, language: string): QueryRecord | null {
        const normalizedValue = value.trim()
        const normalizedLanguage = language.trim()
        if (!normalizedValue || !normalizedLanguage) return null

        const row = this.db
            .prepare(
                `
                SELECT id, value, language, original_value, created_at
                FROM query
                WHERE value = ? AND language = ?
                `
            )
            .get(normalizedValue, normalizedLanguage) as
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

    upsertIntent(queryId: number, intent: string, filetype: string): QueryIntentRecord {
        const normalizedIntent = intent.trim()
        const normalizedFiletype = filetype.trim().toLowerCase() || "md"
        if (!normalizedIntent) {
            throw new Error("Intent cannot be empty")
        }

        this.db
            .prepare(
                `
                INSERT INTO query_intent (intent, filetype)
                VALUES (?, ?)
                ON CONFLICT(intent, filetype) DO NOTHING
                `
            )
            .run(normalizedIntent, normalizedFiletype)

        const row = this.db
            .prepare(
                `
                SELECT id, intent, filetype
                FROM query_intent
                WHERE intent = ? AND filetype = ?
                `
            )
            .get(normalizedIntent, normalizedFiletype) as
            | { id: number; intent: string; filetype: string }
            | undefined

        if (!row) {
            throw new Error("Failed to create or fetch intent")
        }

        this.db
            .prepare(
                `
                INSERT INTO query_query_intent (query_id, intent_id)
                VALUES (?, ?)
                ON CONFLICT(query_id, intent_id) DO NOTHING
                `
            )
            .run(queryId, row.id)

        return {
            id: row.id,
            queryId,
            intent: row.intent,
            filetype: row.filetype,
        }
    }

    listIntentsByQueryId(queryId: number): QueryIntentRecord[] {
        const rows = this.db
            .prepare(
                `
                SELECT qi.id, qi.intent, qi.filetype
                FROM query_query_intent qqi
                JOIN query_intent qi ON qi.id = qqi.intent_id
                WHERE qqi.query_id = ?
                ORDER BY qi.id ASC
                `
            )
            .all(queryId) as Array<{ id: number; intent: string; filetype: string }>

        return rows.map((row) => ({
            id: row.id,
            queryId,
            intent: row.intent,
            filetype: row.filetype,
        }))
    }

    getPrimaryArticleByIntentId(intentId: number): ArticleRecord | null {
        const row = this.db
            .prepare(
                `
                SELECT article_id
                FROM query_intent_article
                WHERE intent_id = ?
                ORDER BY article_id ASC
                LIMIT 1
                `
            )
            .get(intentId) as { article_id: number } | undefined
        if (!row) return null
        return this.getArticleById(row.article_id)
    }

    getIntentById(intentId: number): QueryIntentRecord | null {
        const row = this.db
            .prepare(
                `
                SELECT id, intent, filetype
                FROM query_intent
                WHERE id = ?
                `
            )
            .get(intentId) as { id: number; intent: string; filetype: string } | undefined

        if (!row) return null
        return {
            id: row.id,
            queryId: -1,
            intent: row.intent,
            filetype: row.filetype,
        }
    }

    private slugify(input: string): string {
        const normalized = input
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
        return normalized || "untitled"
    }

    private normalizeFiletype(value: string | null | undefined): string {
        const normalized = (value || "").trim().toLowerCase().replace(/^\.+/, "")
        return normalized || "md"
    }

    private ensureSlugHasFiletype(slug: string, filetype: string): string {
        const normalizedSlug = slug.trim() || "untitled"
        const normalizedType = this.normalizeFiletype(filetype)
        const suffix = `.${normalizedType}`
        if (normalizedSlug.toLowerCase().endsWith(suffix)) return normalizedSlug
        return `${normalizedSlug}${suffix}`
    }

    private slugExists(slug: string, excludeArticleId?: number): boolean {
        const row = excludeArticleId
            ? (this.db
                .prepare(
                    `
                    SELECT id
                    FROM article
                    WHERE slug = ? AND id != ?
                    LIMIT 1
                    `
                )
                .get(slug, excludeArticleId) as { id: number } | undefined)
            : (this.db
                .prepare(
                    `
                    SELECT id
                    FROM article
                    WHERE slug = ?
                    LIMIT 1
                    `
                )
                .get(slug) as { id: number } | undefined)

        return Boolean(row)
    }

    private getUniqueSlug(baseSlug: string, excludeArticleId?: number): string {
        const normalizedBase = baseSlug.trim() || "untitled"
        if (!this.slugExists(normalizedBase, excludeArticleId)) return normalizedBase

        const extMatch = normalizedBase.match(/^(.*?)(\.[a-z0-9_-]+)$/i)
        const stem = extMatch ? extMatch[1] : normalizedBase
        const ext = extMatch ? extMatch[2] : ""

        let index = 2
        while (true) {
            const candidate = `${stem}-${index}${ext}`
            if (!this.slugExists(candidate, excludeArticleId)) return candidate
            index += 1
        }
    }

    createArticle(args: {
        intentId?: number | null
        title: string
        summary: string
        filetype: string
        content?: string | null
        status?: "preview_ready" | "content_generating" | "content_ready" | "content_failed"
        contentErrorMessage?: string | null
        generatedBy?: string | null
        replaceExistingForIntent?: boolean
        keepTitleWhenReplacing?: boolean
    }): ArticleRecord {
        const intentId = args.intentId ?? null
        const replaceExistingForIntent = Boolean(args.replaceExistingForIntent)
        const keepTitleWhenReplacing = Boolean(args.keepTitleWhenReplacing)
        const title = args.title.trim()
        const summary = args.summary.trim()
        const filetype = this.normalizeFiletype(args.filetype)
        const status = args.status ?? "preview_ready"
        const content = args.content == null ? null : args.content.trim()
        const contentErrorMessage = args.contentErrorMessage?.trim() || null
        if (!title || !summary) {
            throw new Error("Article title and summary are required")
        }
        const uniqueSlugBase = this.ensureSlugHasFiletype(this.slugify(title), filetype)

        if (intentId !== null) {
            const existing = this.db
                .prepare(
                    `
                    SELECT a.id
                    FROM query_intent_article qia
                    JOIN article a ON a.id = qia.article_id
                    WHERE qia.intent_id = ?
                    ORDER BY a.id ASC
                    LIMIT 1
                    `
                )
                .get(intentId) as { id: number } | undefined
            if (existing) {
                if (replaceExistingForIntent) {
                    if (keepTitleWhenReplacing) {
                        this.db
                            .prepare(
                                `
                                UPDATE article
                                SET summary = ?,
                                    filetype = ?,
                                    content = ?,
                                    status = ?,
                                    content_error_message = ?,
                                    content_updated_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE content_updated_at END,
                                    generated_by = ?
                                WHERE id = ?
                                `
                            )
                            .run(
                                summary,
                                filetype,
                                content,
                                status,
                                contentErrorMessage,
                                content,
                                args.generatedBy?.trim() || null,
                                existing.id
                            )
                    } else {
                        const uniqueSlug = this.getUniqueSlug(uniqueSlugBase, existing.id)
                        this.db
                            .prepare(
                                `
                                UPDATE article
                                SET title = ?,
                                    slug = ?,
                                    summary = ?,
                                    filetype = ?,
                                    content = ?,
                                    status = ?,
                                    content_error_message = ?,
                                    content_updated_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE content_updated_at END,
                                    generated_by = ?
                                WHERE id = ?
                                `
                            )
                            .run(
                                title,
                                uniqueSlug,
                                summary,
                                filetype,
                                content,
                                status,
                                contentErrorMessage,
                                content,
                                args.generatedBy?.trim() || null,
                                existing.id
                            )
                    }
                }
                return this.getArticleById(existing.id)
            }
        }

        const uniqueSlug = this.getUniqueSlug(uniqueSlugBase)

        const result = this.db
            .prepare(
                `
                INSERT INTO article (title, slug, summary, filetype, content, status, content_error_message, content_updated_at, generated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE NULL END, ?)
                `
            )
            .run(
                title,
                uniqueSlug,
                summary,
                filetype,
                content,
                status,
                contentErrorMessage,
                content,
                args.generatedBy?.trim() || null
            )

        const articleId = result.lastInsertRowid as number
        if (intentId !== null) {
            this.db
                .prepare(
                    `
                    INSERT INTO query_intent_article (intent_id, article_id)
                    VALUES (?, ?)
                    ON CONFLICT(intent_id, article_id) DO NOTHING
                    `
                )
                .run(intentId, articleId)
        }

        return this.getArticleById(articleId)
    }

    clearQueryIntentLinks(queryId: number): number {
        const result = this.db
            .prepare(
                `
                DELETE FROM query_query_intent
                WHERE query_id = ?
                `
            )
            .run(queryId)

        return result.changes
    }

    getArticleById(id: number): ArticleRecord {
        const row = this.db
            .prepare(
                `
                SELECT
                    a.id,
                    a.title,
                    a.slug,
                    a.filetype,
                    a.summary,
                    a.content,
                    a.status,
                    a.content_error_message,
                    a.content_updated_at,
                    a.generated_by,
                    a.created_at,
                    (
                        SELECT qia.intent_id
                        FROM query_intent_article qia
                        WHERE qia.article_id = a.id
                        ORDER BY qia.intent_id ASC
                        LIMIT 1
                    ) AS intent_id
                FROM article a
                WHERE a.id = ?
                `
            )
            .get(id) as
            | {
                  id: number
                  intent_id: number | null
                  title: string
                  slug: string
                  filetype: string
                  summary: string
                  content: string | null
                  status: "preview_ready" | "content_generating" | "content_ready" | "content_failed"
                  content_error_message: string | null
                  content_updated_at: string | null
                  generated_by: string | null
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
            filetype: row.filetype,
            summary: row.summary,
            content: row.content,
            status: row.status,
            contentErrorMessage: row.content_error_message,
            contentUpdatedAt: row.content_updated_at,
            generatedBy: row.generated_by,
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
                    SELECT a.id, a.title, a.slug, a.filetype, a.summary, a.generated_by, a.created_at
                    FROM query_intent_article qia
                    JOIN article a ON a.id = qia.article_id
                    WHERE qia.intent_id = ?
                    ORDER BY a.id ASC
                    `
                )
                .all(intentRow.id) as Array<{
                id: number
                title: string
                slug: string
                filetype: string
                summary: string
                generated_by: string | null
                created_at: string
            }>

            return {
                id: intentRow.id,
                intent: intentRow.intent,
                filetype: intentRow.filetype,
                articles: articleRows.map((article) => ({
                    id: article.id,
                    title: article.title,
                    slug: article.slug,
                    filetype: article.filetype,
                    summary: article.summary,
                    generatedBy: article.generated_by,
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
                WITH article_target AS (
                    SELECT
                        a.id,
                        a.title,
                        a.slug,
                        a.filetype,
                        a.summary,
                        a.content,
                        a.status,
                        a.content_error_message,
                        a.content_updated_at,
                        a.generated_by,
                        a.created_at
                    FROM article a
                    WHERE a.slug = ?
                    LIMIT 1
                ),
                primary_link AS (
                    SELECT
                        qi.id AS intent_id,
                        qi.intent AS intent_value,
                        qi.filetype AS intent_filetype,
                        qqi.query_id AS query_id
                    FROM article_target at
                    JOIN query_intent_article qia ON qia.article_id = at.id
                    JOIN query_intent qi ON qi.id = qia.intent_id
                    JOIN query_query_intent qqi ON qqi.intent_id = qi.id
                    ORDER BY qqi.query_id ASC, qi.id ASC
                    LIMIT 1
                )
                SELECT
                    at.id AS article_id,
                    at.title AS article_title,
                    at.slug AS article_slug,
                    at.filetype AS article_filetype,
                    at.summary AS article_summary,
                    at.content AS article_content,
                    at.status AS article_status,
                    at.content_error_message AS article_content_error_message,
                    at.content_updated_at AS article_content_updated_at,
                    at.generated_by AS article_generated_by,
                    at.created_at AS article_created_at,
                    pl.intent_id AS intent_id,
                    pl.intent_value AS intent_value,
                    pl.intent_filetype AS intent_filetype,
                    pl.query_id AS query_id,
                    q.value AS query_value,
                    q.language AS query_language,
                    q.original_value AS query_original_value,
                    q.created_at AS query_created_at
                FROM article_target at
                LEFT JOIN primary_link pl ON 1 = 1
                LEFT JOIN query q ON q.id = pl.query_id
                `
            )
            .get(slug) as
            | {
                  article_id: number
                  article_title: string
                  article_slug: string
                  article_filetype: string
                  article_summary: string
                  article_content: string | null
                  article_status: "preview_ready" | "content_generating" | "content_ready" | "content_failed"
                  article_content_error_message: string | null
                  article_content_updated_at: string | null
                  article_generated_by: string | null
                  article_created_at: string
                  intent_id: number | null
                  intent_value: string | null
                  intent_filetype: string | null
                  query_id: number | null
                  query_value: string | null
                  query_language: string | null
                  query_original_value: string | null
                  query_created_at: string | null
              }
            | undefined

        if (!row) return null

        const recommendedArticles = this.listArticleRecommendations(row.article_id)

        const payload: ArticleDetailPayload = {
            article: {
                id: row.article_id,
                intentId: row.intent_id,
                title: row.article_title,
                slug: row.article_slug,
                filetype: row.article_filetype,
                summary: row.article_summary,
                content: row.article_content,
                status: row.article_status,
                contentErrorMessage: row.article_content_error_message,
                contentUpdatedAt: row.article_content_updated_at,
                generatedBy: row.article_generated_by,
                createdAt: row.article_created_at,
            },
            recommendedArticles,
        }

        if (row.intent_id !== null && row.query_id !== null && row.intent_value !== null && row.intent_filetype !== null) {
            payload.intent = {
                id: row.intent_id,
                queryId: row.query_id,
                intent: row.intent_value,
                filetype: row.intent_filetype,
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

    getArticleBySlug(slug: string): ArticleRecord | null {
        const row = this.db
            .prepare(
                `
                SELECT id
                FROM article
                WHERE slug = ?
                LIMIT 1
                `
            )
            .get(slug.trim()) as { id: number } | undefined
        if (!row) return null
        return this.getArticleById(row.id)
    }

    createArticleRecommendation(args: {
        sourceArticleId: number
        recommendedArticleId: number
        position?: number | null
    }): void {
        this.db
            .prepare(
                `
                INSERT INTO article_recommendation (source_article_id, recommended_article_id, position)
                VALUES (?, ?, ?)
                ON CONFLICT(source_article_id, recommended_article_id) DO NOTHING
                `
            )
            .run(args.sourceArticleId, args.recommendedArticleId, args.position ?? null)
    }

    listArticleRecommendations(sourceArticleId: number): Array<Pick<ArticleRecord, "id" | "title" | "slug" | "filetype" | "summary" | "status" | "createdAt">> {
        const rows = this.db
            .prepare(
                `
                SELECT
                    a.id,
                    a.title,
                    a.slug,
                    a.filetype,
                    a.summary,
                    a.status,
                    a.created_at,
                    ar.position
                FROM article_recommendation ar
                JOIN article a ON a.id = ar.recommended_article_id
                WHERE ar.source_article_id = ?
                ORDER BY COALESCE(ar.position, 9999) ASC, ar.id ASC
                `
            )
            .all(sourceArticleId) as Array<{
            id: number
            title: string
            slug: string
            filetype: string
            summary: string
            status: "preview_ready" | "content_generating" | "content_ready" | "content_failed"
            created_at: string
            position: number | null
        }>

        return rows.map((row) => ({
            id: row.id,
            title: row.title,
            slug: row.slug,
            filetype: row.filetype,
            summary: row.summary,
            status: row.status,
            createdAt: row.created_at,
        }))
    }

    setArticleContentStatus(args: {
        articleId: number
        status: "content_generating" | "content_ready" | "content_failed"
        content?: string | null
        contentErrorMessage?: string | null
        generatedBy?: string | null
    }): void {
        const content = args.content == null ? null : args.content.trim()
        const errorMessage = args.contentErrorMessage?.trim() || null
        this.db
            .prepare(
                `
                UPDATE article
                SET status = ?,
                    content = CASE WHEN ? IS NOT NULL THEN ? ELSE content END,
                    content_error_message = ?,
                    content_updated_at = CASE WHEN ? = 'content_ready' THEN datetime('now') ELSE content_updated_at END,
                    generated_by = COALESCE(?, generated_by)
                WHERE id = ?
                `
            )
            .run(
                args.status,
                content,
                content,
                errorMessage,
                args.status,
                args.generatedBy?.trim() || null,
                args.articleId
            )
    }

    hasGeneratedContent(queryId: number): boolean {
        const row = this.db
            .prepare(
                `
                SELECT qqi.id
                FROM query_query_intent qqi
                JOIN query_intent_article qia ON qia.intent_id = qqi.intent_id
                WHERE qqi.query_id = ?
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

    listRecentQueries(args: { limit: number; language?: string | null }): SearchRecentQueryItem[] {
        const { language } = args
        const safeLimit = Number.isInteger(args.limit) && args.limit > 0 ? args.limit : 8
        const rows = language
            ? (this.db
                .prepare(
                    `
                    SELECT
                        query_text AS value,
                        language,
                        MAX(created_at) AS last_searched_at
                    FROM query_history
                    WHERE language = ?
                    GROUP BY query_text, language
                    ORDER BY last_searched_at DESC
                    LIMIT ?
                    `
                )
                .all(language, safeLimit) as Array<{
                value: string
                language: string
                last_searched_at: string
            }>)
            : (this.db
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
            }>)

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

    private toGenerationOrder(row: {
        id: number
        query_id: number
        kind: GenerationOrderKind
        intent_id: number | null
        article_id: number | null
        status: GenerationOrderStatus
        requested_by: "user" | "system"
        request_payload_json: string
        result_summary_json: string | null
        error_message: string | null
        started_at: string | null
        finished_at: string | null
        created_at: string
        updated_at: string
    }): GenerationOrderRecord {
        return {
            id: row.id,
            queryId: row.query_id,
            kind: row.kind,
            intentId: row.intent_id,
            articleId: row.article_id,
            status: row.status,
            requestedBy: row.requested_by,
            requestPayloadJson: row.request_payload_json,
            resultSummaryJson: row.result_summary_json,
            errorMessage: row.error_message,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }
    }

    createGenerationOrder(args: {
        queryId: number
        kind: GenerationOrderKind
        intentId?: number | null
        articleId?: number | null
        requestedBy?: "user" | "system"
        requestPayload?: unknown
    }): GenerationOrderRecord {
        const result = this.db
            .prepare(
                `
                INSERT INTO generation_order (query_id, kind, intent_id, article_id, requested_by, request_payload_json)
                VALUES (?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                args.queryId,
                args.kind,
                args.intentId ?? null,
                args.articleId ?? null,
                args.requestedBy ?? "user",
                JSON.stringify(args.requestPayload ?? {})
            )

        return this.getGenerationOrderById(result.lastInsertRowid as number)
    }

    getGenerationOrderById(orderId: number): GenerationOrderRecord {
        const row = this.db
            .prepare(
                `
                SELECT id, query_id, kind, intent_id, article_id, status, requested_by, request_payload_json,
                       result_summary_json, error_message, started_at, finished_at, created_at, updated_at
                FROM generation_order
                WHERE id = ?
                `
            )
            .get(orderId) as
            | {
                id: number
                query_id: number
                kind: GenerationOrderKind
                intent_id: number | null
                article_id: number | null
                status: GenerationOrderStatus
                requested_by: "user" | "system"
                request_payload_json: string
                result_summary_json: string | null
                error_message: string | null
                started_at: string | null
                finished_at: string | null
                created_at: string
                updated_at: string
            }
            | undefined

        if (!row) throw new Error("Generation order not found")
        return this.toGenerationOrder(row)
    }

    listGenerationOrders(args?: {
        limit?: number
        offset?: number
        status?: GenerationOrderStatus
        kind?: GenerationOrderKind
    }): GenerationOrderRecord[] {
        const limit = args?.limit && args.limit > 0 ? Math.min(args.limit, 500) : 120
        const offset = args?.offset && args.offset > 0 ? args.offset : 0
        const status = args?.status || null
        const kind = args?.kind || null

        const rows = this.db
            .prepare(
                `
                SELECT id, query_id, kind, intent_id, article_id, status, requested_by, request_payload_json,
                       result_summary_json, error_message, started_at, finished_at, created_at, updated_at
                FROM generation_order
                WHERE (? IS NULL OR status = ?)
                  AND (? IS NULL OR kind = ?)
                ORDER BY id DESC
                LIMIT ?
                OFFSET ?
                `
            )
            .all(status, status, kind, kind, limit, offset) as Array<{
                id: number
                query_id: number
                kind: GenerationOrderKind
                intent_id: number | null
                article_id: number | null
                status: GenerationOrderStatus
                requested_by: "user" | "system"
                request_payload_json: string
                result_summary_json: string | null
                error_message: string | null
                started_at: string | null
                finished_at: string | null
                created_at: string
                updated_at: string
            }>

        return rows.map((row) => this.toGenerationOrder(row))
    }

    countGenerationOrders(args?: {
        status?: GenerationOrderStatus
        kind?: GenerationOrderKind
    }): number {
        const status = args?.status || null
        const kind = args?.kind || null
        const row = this.db
            .prepare(
                `
                SELECT COUNT(*) AS count
                FROM generation_order
                WHERE (? IS NULL OR status = ?)
                  AND (? IS NULL OR kind = ?)
                `
            )
            .get(status, status, kind, kind) as { count: number } | undefined
        return row?.count ?? 0
    }

    listActiveOrdersForScope(args: {
        scopeType: "query" | "intent" | "article"
        queryId: number
        intentId?: number
        articleId?: number
    }): GenerationOrderRecord[] {
        const rows = args.scopeType === "query"
            ? (this.db
                .prepare(
                    `
                    SELECT id, query_id, kind, intent_id, article_id, status, requested_by, request_payload_json,
                           result_summary_json, error_message, started_at, finished_at, created_at, updated_at
                    FROM generation_order
                    WHERE query_id = ? AND status IN ('queued', 'running')
                    ORDER BY id DESC
                    `
                )
                .all(args.queryId) as Array<{
                    id: number
                    query_id: number
                    kind: GenerationOrderKind
                    intent_id: number | null
                    article_id: number | null
                    status: GenerationOrderStatus
                    requested_by: "user" | "system"
                    request_payload_json: string
                    result_summary_json: string | null
                    error_message: string | null
                    started_at: string | null
                    finished_at: string | null
                    created_at: string
                    updated_at: string
                }>)
            : args.scopeType === "intent"
                ? (this.db
                .prepare(
                    `
                    SELECT id, query_id, kind, intent_id, article_id, status, requested_by, request_payload_json,
                           result_summary_json, error_message, started_at, finished_at, created_at, updated_at
                    FROM generation_order
                    WHERE query_id = ? AND intent_id = ? AND status IN ('queued', 'running')
                    ORDER BY id DESC
                    `
                )
                .all(args.queryId, args.intentId ?? -1) as Array<{
                    id: number
                    query_id: number
                    kind: GenerationOrderKind
                    intent_id: number | null
                    article_id: number | null
                    status: GenerationOrderStatus
                    requested_by: "user" | "system"
                    request_payload_json: string
                    result_summary_json: string | null
                    error_message: string | null
                    started_at: string | null
                    finished_at: string | null
                    created_at: string
                    updated_at: string
                }>)
                : (this.db
                    .prepare(
                        `
                        SELECT id, query_id, kind, intent_id, article_id, status, requested_by, request_payload_json,
                               result_summary_json, error_message, started_at, finished_at, created_at, updated_at
                        FROM generation_order
                        WHERE article_id = ? AND status IN ('queued', 'running')
                        ORDER BY id DESC
                        `
                    )
                    .all(args.articleId ?? -1) as Array<{
                        id: number
                        query_id: number
                        kind: GenerationOrderKind
                        intent_id: number | null
                        article_id: number | null
                        status: GenerationOrderStatus
                        requested_by: "user" | "system"
                        request_payload_json: string
                        result_summary_json: string | null
                        error_message: string | null
                        started_at: string | null
                        finished_at: string | null
                        created_at: string
                        updated_at: string
                    }>)

        return rows.map((row) => this.toGenerationOrder(row))
    }

    claimNextQueuedOrder(): GenerationOrderRecord | null {
        const tx = this.db.transaction(() => {
            const row = this.db
                .prepare(
                    `
                    SELECT id
                    FROM generation_order
                    WHERE status = 'queued'
                    ORDER BY id ASC
                    LIMIT 1
                    `
                )
                .get() as { id: number } | undefined

            if (!row) return null

            const updated = this.db
                .prepare(
                    `
                    UPDATE generation_order
                    SET status = 'running',
                        started_at = datetime('now'),
                        updated_at = datetime('now')
                    WHERE id = ? AND status = 'queued'
                    `
                )
                .run(row.id)

            if (updated.changes === 0) return null
            return this.getGenerationOrderById(row.id)
        })

        return tx()
    }

    completeGenerationOrder(orderId: number, summary?: unknown): void {
        this.db
            .prepare(
                `
                UPDATE generation_order
                SET status = 'completed',
                    result_summary_json = ?,
                    error_message = NULL,
                    finished_at = datetime('now'),
                    updated_at = datetime('now')
                WHERE id = ?
                `
            )
            .run(summary ? JSON.stringify(summary) : null, orderId)
    }

    failGenerationOrder(orderId: number, message: string): void {
        this.db
            .prepare(
                `
                UPDATE generation_order
                SET status = 'failed',
                    error_message = ?,
                    finished_at = datetime('now'),
                    updated_at = datetime('now')
                WHERE id = ?
                `
            )
            .run(message, orderId)
    }

    cancelOrder(orderId: number): void {
        this.db
            .prepare(
                `
                UPDATE generation_order
                SET status = 'cancelled',
                    finished_at = datetime('now'),
                    updated_at = datetime('now')
                WHERE id = ? AND status IN ('queued', 'running')
                `
            )
            .run(orderId)
    }

    appendGenerationEvent(orderId: number, event: GenerationOrderEvent): number {
        const tx = this.db.transaction(() => {
            const row = this.db
                .prepare(
                    `
                    SELECT COALESCE(MAX(seq), 0) AS max_seq
                    FROM generation_event
                    WHERE order_id = ?
                    `
                )
                .get(orderId) as { max_seq: number } | undefined
            const nextSeq = (row?.max_seq ?? 0) + 1
            this.db
                .prepare(
                    `
                    INSERT INTO generation_event (order_id, seq, event_type, payload_json)
                    VALUES (?, ?, ?, ?)
                    `
                )
                .run(orderId, nextSeq, event.type, JSON.stringify(event))
            return nextSeq
        })
        return tx()
    }

    replayOrderEventsAfterSeq(orderId: number, afterSeq: number): Array<{ seq: number; event: GenerationOrderEvent }> {
        const rows = this.db
            .prepare(
                `
                SELECT seq, payload_json
                FROM generation_event
                WHERE order_id = ? AND seq > ?
                ORDER BY seq ASC
                `
            )
            .all(orderId, Math.max(0, afterSeq)) as Array<{ seq: number; payload_json: string }>

        return rows.flatMap((row) => {
            try {
                return [{ seq: row.seq, event: JSON.parse(row.payload_json) as GenerationOrderEvent }]
            } catch {
                return []
            }
        })
    }

    appendGenerationLog(args: {
        orderId: number
        stage: "order" | "spell" | "intent" | "article"
        level: GenerationOrderLogLevel
        message: string
        meta?: unknown
    }): number {
        const result = this.db
            .prepare(
                `
                INSERT INTO generation_log (order_id, stage, level, message, meta_json)
                VALUES (?, ?, ?, ?, ?)
                `
            )
            .run(args.orderId, args.stage, args.level, args.message, JSON.stringify(args.meta ?? {}))
        return result.lastInsertRowid as number
    }

    listGenerationLogs(orderId: number): GenerationOrderLogRecord[] {
        const rows = this.db
            .prepare(
                `
                SELECT id, order_id, stage, level, message, meta_json, created_at
                FROM generation_log
                WHERE order_id = ?
                ORDER BY id ASC
                `
            )
            .all(orderId) as Array<{
                id: number
                order_id: number
                stage: "order" | "spell" | "intent" | "article"
                level: GenerationOrderLogLevel
                message: string
                meta_json: string
                created_at: string
            }>

        return rows.map((row) => ({
            id: row.id,
            orderId: row.order_id,
            stage: row.stage,
            level: row.level,
            message: row.message,
            metaJson: row.meta_json,
            createdAt: row.created_at,
        }))
    }

    getArticleGenerationDurationStats(args: {
        sampleSize: number
        kind?: "preview" | "content"
    }): {
        averageDurationMs: number | null
        sampleCount: number
    } {
        const sampleSize = Number.isInteger(args.sampleSize) && args.sampleSize > 0
            ? Math.min(args.sampleSize, 500)
            : 20
        const row = this.db
            .prepare(
                `
                SELECT
                    COUNT(*) AS sample_count,
                    AVG(duration_ms) AS avg_duration_ms
                FROM (
                    SELECT duration_ms
                    FROM article_generation_run
                    WHERE status = 'completed'
                      AND duration_ms IS NOT NULL
                      AND (? IS NULL OR kind = ?)
                    ORDER BY id DESC
                    LIMIT ?
                ) recent
                `
            )
            .get(args.kind ?? null, args.kind ?? null, sampleSize) as { sample_count: number; avg_duration_ms: number | null } | undefined

        if (!row || row.sample_count <= 0 || row.avg_duration_ms == null) {
            return {
                averageDurationMs: null,
                sampleCount: 0,
            }
        }
        return {
            averageDurationMs: Math.round(row.avg_duration_ms),
            sampleCount: row.sample_count,
        }
    }

    createArticleGenerationRun(args: {
        queryId: number
        intentId?: number | null
        articleId?: number | null
        kind: "preview" | "content"
        orderId: number
    }): number {
        const result = this.db
            .prepare(
                `
                INSERT INTO article_generation_run (query_id, intent_id, article_id, order_id, kind, status)
                VALUES (?, ?, ?, ?, ?, 'running')
                `
            )
            .run(args.queryId, args.intentId ?? null, args.articleId ?? null, args.orderId, args.kind)
        return result.lastInsertRowid as number
    }

    completeArticleGenerationRun(args: {
        runId: number
        articleId?: number | null
        attempts: number
        durationMs: number
        llmDurationMs: number
    }): void {
        this.db
            .prepare(
                `
                UPDATE article_generation_run
                SET status = 'completed',
                    article_id = ?,
                    attempts = ?,
                    duration_ms = ?,
                    llm_duration_ms = ?,
                    error_message = NULL,
                    finished_at = datetime('now'),
                    updated_at = datetime('now')
                WHERE id = ?
                `
            )
            .run(
                args.articleId ?? null,
                Math.max(1, Math.trunc(args.attempts)),
                Math.max(0, Math.trunc(args.durationMs)),
                Math.max(0, Math.trunc(args.llmDurationMs)),
                args.runId
            )
    }

    failArticleGenerationRun(args: {
        runId: number
        attempts: number
        durationMs: number
        errorMessage: string
        llmDurationMs?: number | null
    }): void {
        this.db
            .prepare(
                `
                UPDATE article_generation_run
                SET status = 'failed',
                    attempts = ?,
                    duration_ms = ?,
                    llm_duration_ms = ?,
                    error_message = ?,
                    finished_at = datetime('now'),
                    updated_at = datetime('now')
                WHERE id = ?
                `
            )
            .run(
                Math.max(1, Math.trunc(args.attempts)),
                Math.max(0, Math.trunc(args.durationMs)),
                args.llmDurationMs == null ? null : Math.max(0, Math.trunc(args.llmDurationMs)),
                args.errorMessage.trim() || "Article generation failed",
                args.runId
            )
    }

    listArticleGenerationRuns(args?: {
        limit?: number
        offset?: number
        status?: "running" | "completed" | "failed"
        kind?: "preview" | "content"
    }): Array<{
        id: number
        queryId: number
        intentId: number | null
        articleId: number | null
        orderId: number
        kind: "preview" | "content"
        status: "running" | "completed" | "failed"
        attempts: number | null
        durationMs: number | null
        llmDurationMs: number | null
        errorMessage: string | null
        startedAt: string
        finishedAt: string | null
        createdAt: string
        updatedAt: string
    }> {
        const limit = args?.limit && args.limit > 0 ? Math.min(args.limit, 500) : 120
        const offset = args?.offset && args.offset > 0 ? args.offset : 0
        const status = args?.status || null
        const kind = args?.kind || null

        const rows = this.db
            .prepare(
                `
                SELECT
                    id,
                    query_id,
                    intent_id,
                    article_id,
                    order_id,
                    kind,
                    status,
                    attempts,
                    duration_ms,
                    llm_duration_ms,
                    error_message,
                    started_at,
                    finished_at,
                    created_at,
                    updated_at
                FROM article_generation_run
                WHERE (? IS NULL OR status = ?)
                  AND (? IS NULL OR kind = ?)
                ORDER BY id DESC
                LIMIT ?
                OFFSET ?
                `
            )
            .all(status, status, kind, kind, limit, offset) as Array<{
            id: number
            query_id: number
            intent_id: number | null
            article_id: number | null
            order_id: number
            kind: "preview" | "content"
            status: "running" | "completed" | "failed"
            attempts: number | null
            duration_ms: number | null
            llm_duration_ms: number | null
            error_message: string | null
            started_at: string
            finished_at: string | null
            created_at: string
            updated_at: string
        }>

        return rows.map((row) => ({
            id: row.id,
            queryId: row.query_id,
            intentId: row.intent_id,
            articleId: row.article_id,
            orderId: row.order_id,
            kind: row.kind,
            status: row.status,
            attempts: row.attempts,
            durationMs: row.duration_ms,
            llmDurationMs: row.llm_duration_ms,
            errorMessage: row.error_message,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }))
    }

    countArticleGenerationRuns(args?: {
        status?: "running" | "completed" | "failed"
        kind?: "preview" | "content"
    }): number {
        const status = args?.status || null
        const kind = args?.kind || null
        const row = this.db
            .prepare(
                `
                SELECT COUNT(*) AS count
                FROM article_generation_run
                WHERE (? IS NULL OR status = ?)
                  AND (? IS NULL OR kind = ?)
                `
            )
            .get(status, status, kind, kind) as { count: number } | undefined
        return row?.count ?? 0
    }

    tryAcquireLock(args: {
        orderId: number
        scopeType: "query" | "intent" | "article"
        scopeKey: string
        leaseSeconds: number
    }): { ok: boolean; ownerOrderId?: number } {
        const tx = this.db.transaction(() => {
            this.db
                .prepare(
                    `
                    DELETE FROM generation_lock
                    WHERE lease_expires_at <= datetime('now')
                    `
                )
                .run()

            const existing = this.db
                .prepare(
                    `
                    SELECT owner_order_id
                    FROM generation_lock
                    WHERE scope_type = ? AND scope_key = ?
                    LIMIT 1
                    `
                )
                .get(args.scopeType, args.scopeKey) as { owner_order_id: number } | undefined

            if (existing && existing.owner_order_id !== args.orderId) {
                return { ok: false as const, ownerOrderId: existing.owner_order_id }
            }

            this.db
                .prepare(
                    `
                    INSERT INTO generation_lock (scope_type, scope_key, owner_order_id, lease_expires_at, updated_at)
                    VALUES (?, ?, ?, datetime('now', '+' || ? || ' seconds'), datetime('now'))
                    ON CONFLICT(scope_type, scope_key)
                    DO UPDATE SET
                      owner_order_id = excluded.owner_order_id,
                      lease_expires_at = excluded.lease_expires_at,
                      updated_at = datetime('now')
                    `
                )
                .run(args.scopeType, args.scopeKey, args.orderId, args.leaseSeconds)

            return { ok: true as const }
        })

        return tx()
    }

    renewOrderLocks(orderId: number, leaseSeconds: number): void {
        this.db
            .prepare(
                `
                UPDATE generation_lock
                SET lease_expires_at = datetime('now', '+' || ? || ' seconds'),
                    updated_at = datetime('now')
                WHERE owner_order_id = ?
                `
            )
            .run(leaseSeconds, orderId)
    }

    releaseOrderLocks(orderId: number): void {
        this.db
            .prepare(
                `
                DELETE FROM generation_lock
                WHERE owner_order_id = ?
                `
            )
            .run(orderId)
    }
}
