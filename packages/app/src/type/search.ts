export type QueryRecord = {
    id: number
    value: string
    createdAt: string
}

export type QueryIntentRecord = {
    id: number
    queryId: number
    intent: string
}

export type ArticleRecord = {
    id: number
    intentId: number
    title: string
    slug: string
    content: string
    createdAt: string
}

export type ArticleSummary = Pick<ArticleRecord, "id" | "title" | "slug" | "createdAt"> & {
    snippet: string
}

export type QueryIntentWithArticles = {
    id: number
    intent: string
    articles: ArticleSummary[]
}

export type QueryResultPayload = {
    query: QueryRecord
    intents: QueryIntentWithArticles[]
}

export type ArticleDetailPayload = {
    article: ArticleRecord
    intent: QueryIntentRecord
    query: QueryRecord
    relatedIntents: Array<Pick<QueryIntentRecord, "id" | "intent">>
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
    intentId: number
    article: {
        id: number
        title: string
        slug: string
        snippet: string
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
