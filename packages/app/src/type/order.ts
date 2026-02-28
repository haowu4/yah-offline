export type GenerationOrderKind =
  | "query_full"
  | "intent_regen"
  | "article_regen_keep_title"
  | "article_content_generate"

export type GenerationOrderStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export type GenerationOrderRecord = {
  id: number
  queryId: number
  kind: GenerationOrderKind
  intentId: number | null
  articleId: number | null
  status: GenerationOrderStatus
  requestedBy: "user" | "system"
  requestPayloadJson: string
  resultSummaryJson: string | null
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type GenerationEventType =
  | "order.started"
  | "order.progress"
  | "intent.upserted"
  | "article.upserted"
  | "order.completed"
  | "order.failed"

export type GenerationOrderStartedEvent = {
  type: "order.started"
  orderId: number
  queryId: number
  kind: GenerationOrderKind
  intentId?: number
}

export type GenerationOrderProgressEvent = {
  type: "order.progress"
  orderId: number
  queryId: number
  stage: "spell" | "intent" | "article"
  message: string
}

export type GenerationIntentUpsertedEvent = {
  type: "intent.upserted"
  orderId: number
  queryId: number
  intent: {
    id: number
    value: string
  }
}

export type GenerationArticleUpsertedEvent = {
  type: "article.upserted"
  orderId: number
  queryId: number
  intentId: number
  article: {
    id: number
    title: string
    slug: string
    summary: string
  }
}

export type GenerationOrderCompletedEvent = {
  type: "order.completed"
  orderId: number
  queryId: number
}

export type GenerationOrderFailedEvent = {
  type: "order.failed"
  orderId: number
  queryId: number
  message: string
}

export type GenerationOrderEvent =
  | GenerationOrderStartedEvent
  | GenerationOrderProgressEvent
  | GenerationIntentUpsertedEvent
  | GenerationArticleUpsertedEvent
  | GenerationOrderCompletedEvent
  | GenerationOrderFailedEvent

export type GenerationOrderLogLevel = "debug" | "info" | "warn" | "error"

export type GenerationOrderLogRecord = {
  id: number
  orderId: number
  stage: "order" | "spell" | "intent" | "article"
  level: GenerationOrderLogLevel
  message: string
  metaJson: string
  createdAt: string
}
