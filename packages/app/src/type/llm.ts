import { SearchStreamEvent } from "./search.js"

export type LLMJobKind = "search.generate"

export type SearchGenerateJobPayload = {
  queryId: number
  regenerateIntents?: boolean
  regenerateArticles?: boolean
  targetIntentId?: number
}

export type LLMJobPayloadByKind = {
  "search.generate": SearchGenerateJobPayload
}

export type LLMJobStatus = "queued" | "running" | "completed" | "failed"

export type LLMJobRecord = {
  id: number
  kind: LLMJobKind
  entityId: string
  payloadJson: string
  status: LLMJobStatus
  priority: number
  attempts: number
  maxAttempts: number
  errorMessage: string | null
  runAfter: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type LLMEventTopic = "search.query"

export type LLMEventPayloadByTopic = {
  "search.query": SearchStreamEvent
}

export type LLMEventRecord = {
  id: number
  topic: LLMEventTopic
  entityId: string
  eventType: string
  payloadJson: string
  createdAt: string
}
