export type QueryRecord = {
    id: number
    value: string
    language: string
    originalValue: string | null
    createdAt: string
}

export type QueryIntentRecord = {
    id: number
    queryId: number
    intent: string
    filetype: string
}

export type ArticleRecord = {
    id: number
    intentId: number | null
    title: string
    slug: string
    filetype: string
    summary: string
    content: string | null
    status: "preview_ready" | "content_generating" | "content_ready" | "content_failed"
    contentErrorMessage: string | null
    contentUpdatedAt: string | null
    generatedBy: string | null
    createdAt: string
}

export type ArticleSummary = Pick<ArticleRecord, "id" | "title" | "slug" | "filetype" | "generatedBy" | "createdAt"> & {
    summary: string
}

export type QueryIntentWithArticles = {
    id: number
    intent: string
    filetype: string
    articles: ArticleSummary[]
}

export type QueryResultPayload = {
    query: QueryRecord
    intents: QueryIntentWithArticles[]
}

export type ArticleDetailPayload = {
    article: ArticleRecord
    intent?: QueryIntentRecord
    query?: QueryRecord
    recommendedArticles: Array<Pick<ArticleRecord, "id" | "title" | "slug" | "filetype" | "summary" | "status" | "createdAt">>
}

export type SearchStreamIntentCreatedEvent = {
    type: "intent.created"
    queryId: number
    intent: {
        id: number
        value: string
    }
}

export type SearchStreamArticleCreatedEvent = {
    type: "article.created"
    queryId: number
    intentId?: number
    article: {
        id: number
        title: string
        slug: string
        summary: string
    }
}

export type SearchStreamCompletedEvent = {
    type: "query.completed"
    queryId: number
    replayed: boolean
}

export type SearchStreamErrorEvent = {
    type: "query.error"
    queryId: number
    message: string
}

export type SearchStreamEvent =
    | SearchStreamIntentCreatedEvent
    | SearchStreamArticleCreatedEvent
    | SearchStreamCompletedEvent
    | SearchStreamErrorEvent

export type SearchRecentQueryItem = {
    value: string
    language: string
    lastSearchedAt: string
}

export type SearchSuggestionsPayload = {
    examples: string[]
    recent: SearchRecentQueryItem[]
    isFirstTimeUser: boolean
}
