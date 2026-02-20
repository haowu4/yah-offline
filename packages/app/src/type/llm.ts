import { MailStreamEvent } from "./mail.js"
import { SearchStreamEvent } from "./search.js"

export type LLMJobKind = "mail.reply" | "search.generate"

export type MailReplyJobPayload = {
  threadId: number
  userReplyId: number
  requestedContactId: number | null
  requestedModel: string | null
}

export type SearchGenerateJobPayload = {
  queryId: number
  queryValue: string
}

export type LLMJobPayloadByKind = {
  "mail.reply": MailReplyJobPayload
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

export type LLMEventTopic = "mail" | "search.query"

export type LLMEventPayloadByTopic = {
  mail: MailStreamEvent
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
