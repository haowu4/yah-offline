import type Database from "better-sqlite3"
import {
  LLMEventRecord,
  LLMEventTopic,
  LLMJobKind,
  LLMJobPayloadByKind,
  LLMJobRecord,
} from "../../type/llm.js"

function toJobRecord(row: {
  id: number
  kind: LLMJobKind
  entity_id: string
  payload_json: string
  status: "queued" | "running" | "completed" | "failed"
  priority: number
  attempts: number
  max_attempts: number
  error_message: string | null
  run_after: string
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}): LLMJobRecord {
  return {
    id: row.id,
    kind: row.kind,
    entityId: row.entity_id,
    payloadJson: row.payload_json,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    errorMessage: row.error_message,
    runAfter: row.run_after,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class LLMDBClient {
  db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  enqueueJob<K extends LLMJobKind>(args: {
    kind: K
    entityId: string
    payload: LLMJobPayloadByKind[K]
    priority: number
    maxAttempts?: number
  }): LLMJobRecord {
    const result = this.db
      .prepare(
        `
          INSERT INTO llm_job (kind, entity_id, payload_json, priority, max_attempts)
          VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(
        args.kind,
        args.entityId,
        JSON.stringify(args.payload),
        args.priority,
        args.maxAttempts && args.maxAttempts > 0 ? args.maxAttempts : 3
      )

    return this.getJobById(result.lastInsertRowid as number)
  }

  hasActiveJob(kind: LLMJobKind, entityId: string): boolean {
    const row = this.db
      .prepare(
        `
          SELECT id
          FROM llm_job
          WHERE kind = ? AND entity_id = ? AND status IN ('queued', 'running')
          LIMIT 1
        `
      )
      .get(kind, entityId) as { id: number } | undefined

    return Boolean(row)
  }

  getJobById(jobId: number): LLMJobRecord {
    const row = this.db
      .prepare(
        `
          SELECT id, kind, entity_id, payload_json, status, priority, attempts, max_attempts, error_message,
                 run_after, started_at, finished_at, created_at, updated_at
          FROM llm_job
          WHERE id = ?
        `
      )
      .get(jobId) as
      | {
          id: number
          kind: LLMJobKind
          entity_id: string
          payload_json: string
          status: "queued" | "running" | "completed" | "failed"
          priority: number
          attempts: number
          max_attempts: number
          error_message: string | null
          run_after: string
          started_at: string | null
          finished_at: string | null
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) throw new Error("LLM job not found")
    return toJobRecord(row)
  }

  requeueExpiredRunningJobs(maxRunSeconds: number): number {
    const result = this.db
      .prepare(
        `
          UPDATE llm_job
          SET status = 'queued',
              error_message = 'Recovered from expired running job',
              run_after = datetime('now'),
              started_at = NULL,
              updated_at = datetime('now')
          WHERE status = 'running' AND started_at <= datetime('now', '-' || ? || ' seconds')
        `
      )
      .run(maxRunSeconds)

    return result.changes
  }

  claimNextQueuedJob(): LLMJobRecord | null {
    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare(
          `
            SELECT id
            FROM llm_job
            WHERE status = 'queued' AND run_after <= datetime('now')
            ORDER BY priority ASC, id ASC
            LIMIT 1
          `
        )
        .get() as { id: number } | undefined

      if (!row) return null

      const updated = this.db
        .prepare(
          `
            UPDATE llm_job
            SET status = 'running',
                started_at = datetime('now'),
                attempts = attempts + 1,
                updated_at = datetime('now')
            WHERE id = ? AND status = 'queued'
          `
        )
        .run(row.id)

      if (updated.changes === 0) return null
      return this.getJobById(row.id)
    })

    return tx()
  }

  completeJob(jobId: number): void {
    this.db
      .prepare(
        `
          UPDATE llm_job
          SET status = 'completed',
              error_message = NULL,
              finished_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `
      )
      .run(jobId)
  }

  retryJob(jobId: number, message: string, delaySeconds: number): void {
    this.db
      .prepare(
        `
          UPDATE llm_job
          SET status = 'queued',
              error_message = ?,
              run_after = datetime('now', '+' || ? || ' seconds'),
              started_at = NULL,
              finished_at = NULL,
              updated_at = datetime('now')
          WHERE id = ?
        `
      )
      .run(message, delaySeconds, jobId)
  }

  failJob(jobId: number, message: string): void {
    this.db
      .prepare(
        `
          UPDATE llm_job
          SET status = 'failed',
              error_message = ?,
              finished_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `
      )
      .run(message, jobId)
  }

  appendEvent<T extends LLMEventTopic>(args: {
    topic: T
    entityId: string
    eventType: string
    payload: unknown
  }): number {
    const result = this.db
      .prepare(
        `
          INSERT INTO llm_event (topic, entity_id, event_type, payload_json)
          VALUES (?, ?, ?, ?)
        `
      )
      .run(args.topic, args.entityId, args.eventType, JSON.stringify(args.payload))

    return result.lastInsertRowid as number
  }

  listEventsAfterId(args: {
    lastId: number
    topic: LLMEventTopic
    entityId?: string
    limit?: number
  }): LLMEventRecord[] {
    const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 1000) : 500
    const rows = args.entityId
      ? (this.db
          .prepare(
            `
              SELECT id, topic, entity_id, event_type, payload_json, created_at
              FROM llm_event
              WHERE id > ? AND topic = ? AND entity_id = ?
              ORDER BY id ASC
              LIMIT ?
            `
          )
          .all(args.lastId, args.topic, args.entityId, limit) as Array<{
          id: number
          topic: LLMEventTopic
          entity_id: string
          event_type: string
          payload_json: string
          created_at: string
        }>)
      : (this.db
          .prepare(
            `
              SELECT id, topic, entity_id, event_type, payload_json, created_at
              FROM llm_event
              WHERE id > ? AND topic = ?
              ORDER BY id ASC
              LIMIT ?
            `
          )
          .all(args.lastId, args.topic, limit) as Array<{
          id: number
          topic: LLMEventTopic
          entity_id: string
          event_type: string
          payload_json: string
          created_at: string
          }>)

    return rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      entityId: row.entity_id,
      eventType: row.event_type,
      payloadJson: row.payload_json,
      createdAt: row.created_at,
    }))
  }

  deleteEvents(args: {
    topic: LLMEventTopic
    entityId: string
  }): number {
    const result = this.db
      .prepare(
        `
          DELETE FROM llm_event
          WHERE topic = ? AND entity_id = ?
        `
      )
      .run(args.topic, args.entityId)

    return result.changes
  }
}
