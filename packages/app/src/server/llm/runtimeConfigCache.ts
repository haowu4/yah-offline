import { AppCtx } from "../../appCtx.js"

function parsePositiveIntOrDefault(value: string | null, defaultValue: number): number {
  if (!value) return defaultValue
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue
}

export type LLMRuntimeConfig = {
  llmRetryMaxAttempts: number
  llmRequestTimeoutMs: number
  mailAttachmentsMaxCount: number
  mailAttachmentsMaxTextChars: number
  mailContextMaxMessages: number
  mailContextSummaryTriggerTokenCount: number
}

export class LLMRuntimeConfigCache {
  private appCtx: AppCtx
  private ttlMs: number
  private loadedAt = 0
  private snapshot: LLMRuntimeConfig | null = null

  constructor(appCtx: AppCtx, ttlMs = 5000) {
    this.appCtx = appCtx
    this.ttlMs = ttlMs
  }

  get(): LLMRuntimeConfig {
    const now = Date.now()
    if (this.snapshot && now - this.loadedAt < this.ttlMs) {
      return this.snapshot
    }

    const configDB = this.appCtx.dbClients.config()
    const next: LLMRuntimeConfig = {
      llmRetryMaxAttempts: parsePositiveIntOrDefault(
        configDB.getValue("llm.retry.max_attempts"),
        2
      ),
      llmRequestTimeoutMs: parsePositiveIntOrDefault(
        configDB.getValue("llm.retry.timeout_ms"),
        20000
      ),
      mailAttachmentsMaxCount: parsePositiveIntOrDefault(
        configDB.getValue("mail.attachments.max_count"),
        3
      ),
      mailAttachmentsMaxTextChars: parsePositiveIntOrDefault(
        configDB.getValue("mail.attachments.max_text_chars"),
        20000
      ),
      mailContextMaxMessages: parsePositiveIntOrDefault(
        configDB.getValue("mail.context.max_messages"),
        20
      ),
      mailContextSummaryTriggerTokenCount: parsePositiveIntOrDefault(
        configDB.getValue("mail.context.summary_trigger_token_count"),
        5000
      ),
    }

    this.snapshot = next
    this.loadedAt = now
    return next
  }
}
