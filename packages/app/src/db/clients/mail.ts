import type Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import {
  MailAttachmentDetailPayload,
  MailAttachmentRecord,
  MailAttachmentSummary,
  MailReplyDetailPayload,
  MailReplyRecord,
  MailThreadDetailPayload,
  MailThreadRecord,
  MailThreadSummary,
  MailToolAttachmentRequest,
} from "../../type/mail.js"

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return normalized || "item"
}

function toBool(value: number): boolean {
  return value === 1
}

function toReplyRecord(row: {
  id: number
  thread_id: number
  role: "user" | "assistant" | "system"
  model: string | null
  content: string
  unread: number
  token_count: number | null
  status: "pending" | "streaming" | "completed" | "error"
  error_message: string | null
  created_at: string
}): MailReplyRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    model: row.model,
    content: row.content,
    unread: toBool(row.unread),
    tokenCount: row.token_count,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }
}

export class MailDBClient {
  db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
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
    if (collapsed.length <= 220) return collapsed
    return `${collapsed.slice(0, 217)}...`
  }

  createThread(args?: { title?: string }): MailThreadRecord {
    const threadUid = randomUUID()
    const title = args?.title?.trim() ?? ""
    const userSetTitle = title.length > 0 ? 1 : 0

    const result = this.db
      .prepare(
        `
          INSERT INTO mail_thread (thread_uid, title, user_set_title)
          VALUES (?, ?, ?)
        `
      )
      .run(threadUid, title, userSetTitle)

    return this.getThreadByIdStrict(result.lastInsertRowid as number)
  }

  getThreadByUid(threadUid: string): MailThreadRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT id, thread_uid, title, user_set_title, created_at, updated_at
          FROM mail_thread
          WHERE thread_uid = ?
        `
      )
      .get(threadUid) as
      | {
          id: number
          thread_uid: string
          title: string
          user_set_title: number
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) return null

    return {
      id: row.id,
      threadUid: row.thread_uid,
      title: row.title,
      userSetTitle: toBool(row.user_set_title),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private getThreadByIdStrict(id: number): MailThreadRecord {
    const row = this.db
      .prepare(
        `
          SELECT id, thread_uid, title, user_set_title, created_at, updated_at
          FROM mail_thread
          WHERE id = ?
        `
      )
      .get(id) as
      | {
          id: number
          thread_uid: string
          title: string
          user_set_title: number
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) throw new Error("Thread not found")

    return {
      id: row.id,
      threadUid: row.thread_uid,
      title: row.title,
      userSetTitle: toBool(row.user_set_title),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  getThreadById(id: number): MailThreadRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT id, thread_uid, title, user_set_title, created_at, updated_at
          FROM mail_thread
          WHERE id = ?
        `
      )
      .get(id) as
      | {
          id: number
          thread_uid: string
          title: string
          user_set_title: number
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) return null

    return {
      id: row.id,
      threadUid: row.thread_uid,
      title: row.title,
      userSetTitle: toBool(row.user_set_title),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  updateThreadTitle(threadId: number, title: string, args?: { userSetTitle?: boolean }): void {
    const userSetTitle = args?.userSetTitle ? 1 : 0
    this.db
      .prepare(
        `
          UPDATE mail_thread
          SET title = ?, user_set_title = ?, updated_at = datetime('now')
          WHERE id = ?
        `
      )
      .run(title.trim(), userSetTitle, threadId)
  }

  touchThread(threadId: number): void {
    this.db
      .prepare("UPDATE mail_thread SET updated_at = datetime('now') WHERE id = ?")
      .run(threadId)
  }

  createReply(args: {
    threadId: number
    role: "user" | "assistant" | "system"
    model?: string | null
    content: string
    unread: boolean
    status?: "pending" | "streaming" | "completed" | "error"
    errorMessage?: string | null
    tokenCount?: number | null
  }): MailReplyRecord {
    const content = args.content.trim()
    const status = args.status ?? "completed"

    const result = this.db
      .prepare(
        `
          INSERT INTO mail_reply (
            thread_id, role, model, content, unread, token_count, status, error_message
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        args.threadId,
        args.role,
        args.model?.trim() || null,
        content,
        args.unread ? 1 : 0,
        args.tokenCount ?? null,
        status,
        args.errorMessage?.trim() || null
      )

    this.touchThread(args.threadId)
    return this.getReplyById(result.lastInsertRowid as number)
  }

  getReplyById(replyId: number): MailReplyRecord {
    const row = this.db
      .prepare(
        `
          SELECT id, thread_id, role, model, content, unread, token_count, status, error_message, created_at
          FROM mail_reply
          WHERE id = ?
        `
      )
      .get(replyId) as
      | {
          id: number
          thread_id: number
          role: "user" | "assistant" | "system"
          model: string | null
          content: string
          unread: number
          token_count: number | null
          status: "pending" | "streaming" | "completed" | "error"
          error_message: string | null
          created_at: string
        }
      | undefined

    if (!row) throw new Error("Reply not found")
    return toReplyRecord(row)
  }

  listRepliesByThreadId(threadId: number): MailReplyRecord[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, thread_id, role, model, content, unread, token_count, status, error_message, created_at
          FROM mail_reply
          WHERE thread_id = ?
          ORDER BY id ASC
        `
      )
      .all(threadId) as Array<{
      id: number
      thread_id: number
      role: "user" | "assistant" | "system"
      model: string | null
      content: string
      unread: number
      token_count: number | null
      status: "pending" | "streaming" | "completed" | "error"
      error_message: string | null
      created_at: string
    }>

    return rows.map((row) => toReplyRecord(row))
  }

  createAttachment(args: {
    replyId: number
    filename: string
    kind: "text" | "image"
    mimeType: string
    textContent?: string | null
    binaryContent?: Buffer | null
    toolName?: string | null
    modelQuality?: "low" | "normal" | "high" | null
  }): MailAttachmentRecord {
    const filename = args.filename.trim() || `file-${Date.now()}`
    const baseSlug = slugify(filename.replace(/\.[^.]+$/, ""))

    let slug = baseSlug
    let suffix = 2
    while (true) {
      const row = this.db
        .prepare("SELECT id FROM mail_attachment WHERE reply_id = ? AND slug = ?")
        .get(args.replyId, slug) as { id: number } | undefined
      if (!row) break
      slug = `${baseSlug}-${suffix}`
      suffix += 1
    }

    const result = this.db
      .prepare(
        `
          INSERT INTO mail_attachment (
            reply_id, slug, filename, kind, mime_type, text_content, binary_content, tool_name, model_quality
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        args.replyId,
        slug,
        filename,
        args.kind,
        args.mimeType,
        args.textContent ?? null,
        args.binaryContent ?? null,
        args.toolName ?? null,
        args.modelQuality ?? null
      )

    return this.getAttachmentById(result.lastInsertRowid as number)
  }

  getAttachmentById(id: number): MailAttachmentRecord {
    const row = this.db
      .prepare(
        `
          SELECT id, reply_id, slug, filename, kind, mime_type, text_content, binary_content, tool_name, model_quality, created_at
          FROM mail_attachment
          WHERE id = ?
        `
      )
      .get(id) as
      | {
          id: number
          reply_id: number
          slug: string
          filename: string
          kind: "text" | "image"
          mime_type: string
          text_content: string | null
          binary_content: Buffer | null
          tool_name: string | null
          model_quality: "low" | "normal" | "high" | null
          created_at: string
        }
      | undefined

    if (!row) throw new Error("Attachment not found")

    return {
      id: row.id,
      replyId: row.reply_id,
      slug: row.slug,
      filename: row.filename,
      kind: row.kind,
      mimeType: row.mime_type,
      textContent: row.text_content,
      binaryContent: row.binary_content,
      toolName: row.tool_name,
      modelQuality: row.model_quality,
      createdAt: row.created_at,
    }
  }

  listAttachmentsByReplyId(replyId: number): MailAttachmentSummary[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, reply_id, slug, filename, kind, mime_type, created_at
          FROM mail_attachment
          WHERE reply_id = ?
          ORDER BY id ASC
        `
      )
      .all(replyId) as Array<{
      id: number
      reply_id: number
      slug: string
      filename: string
      kind: "text" | "image"
      mime_type: string
      created_at: string
    }>

    return rows.map((row) => ({
      id: row.id,
      replyId: row.reply_id,
      slug: row.slug,
      filename: row.filename,
      kind: row.kind,
      mimeType: row.mime_type,
      createdAt: row.created_at,
    }))
  }

  listThreadAttachments(threadId: number): MailAttachmentSummary[] {
    const rows = this.db
      .prepare(
        `
          SELECT a.id, a.reply_id, a.slug, a.filename, a.kind, a.mime_type, a.created_at
          FROM mail_attachment a
          JOIN mail_reply r ON r.id = a.reply_id
          WHERE r.thread_id = ?
          ORDER BY a.id ASC
        `
      )
      .all(threadId) as Array<{
      id: number
      reply_id: number
      slug: string
      filename: string
      kind: "text" | "image"
      mime_type: string
      created_at: string
    }>

    return rows.map((row) => ({
      id: row.id,
      replyId: row.reply_id,
      slug: row.slug,
      filename: row.filename,
      kind: row.kind,
      mimeType: row.mime_type,
      createdAt: row.created_at,
    }))
  }

  getThreadDetailByUid(threadUid: string): MailThreadDetailPayload | null {
    const thread = this.getThreadByUid(threadUid)
    if (!thread) return null

    const rows = this.db
      .prepare(
        `
          SELECT
            r.id,
            r.thread_id,
            r.role,
            r.model,
            r.content,
            r.unread,
            r.token_count,
            r.status,
            r.error_message,
            r.created_at,
            (SELECT COUNT(1) FROM mail_attachment a WHERE a.reply_id = r.id) AS attachment_count
          FROM mail_reply r
          WHERE r.thread_id = ?
          ORDER BY r.id ASC
        `
      )
      .all(thread.id) as Array<{
      id: number
      thread_id: number
      role: "user" | "assistant" | "system"
      model: string | null
      content: string
      unread: number
      token_count: number | null
      status: "pending" | "streaming" | "completed" | "error"
      error_message: string | null
      created_at: string
      attachment_count: number
    }>

    return {
      thread,
      replies: rows.map((row) => ({
        ...toReplyRecord(row),
        attachmentCount: row.attachment_count,
      })),
    }
  }

  getReplyDetail(args: { threadUid: string; replyId: number }): MailReplyDetailPayload | null {
    const thread = this.getThreadByUid(args.threadUid)
    if (!thread) return null

    const row = this.db
      .prepare(
        `
          SELECT
            r.id,
            r.thread_id,
            r.role,
            r.model,
            r.content,
            r.unread,
            r.token_count,
            r.status,
            r.error_message,
            r.created_at
          FROM mail_reply r
          WHERE r.id = ? AND r.thread_id = ?
        `
      )
      .get(args.replyId, thread.id) as
      | {
          id: number
          thread_id: number
          role: "user" | "assistant" | "system"
          model: string | null
          content: string
          unread: number
          token_count: number | null
          status: "pending" | "streaming" | "completed" | "error"
          error_message: string | null
          created_at: string
        }
      | undefined

    if (!row) return null

    return {
      thread,
      reply: toReplyRecord(row),
      attachments: this.listAttachmentsByReplyId(row.id),
    }
  }

  getAttachmentDetail(args: {
    threadUid: string
    replyId: number
    attachmentSlug: string
  }): MailAttachmentDetailPayload | null {
    const thread = this.getThreadByUid(args.threadUid)
    if (!thread) return null

    const row = this.db
      .prepare(
        `
          SELECT
            a.id,
            a.slug,
            a.filename,
            a.kind,
            a.mime_type,
            a.text_content,
            a.binary_content,
            a.created_at
          FROM mail_attachment a
          JOIN mail_reply r ON r.id = a.reply_id
          WHERE r.thread_id = ? AND a.reply_id = ? AND a.slug = ?
        `
      )
      .get(thread.id, args.replyId, args.attachmentSlug) as
      | {
          id: number
          slug: string
          filename: string
          kind: "text" | "image"
          mime_type: string
          text_content: string | null
          binary_content: Buffer | null
          created_at: string
        }
      | undefined

    if (!row) return null

    return {
      threadUid: thread.threadUid,
      replyId: args.replyId,
      attachment: {
        id: row.id,
        slug: row.slug,
        filename: row.filename,
        kind: row.kind,
        mimeType: row.mime_type,
        textContent: row.text_content,
        base64Content: row.binary_content ? row.binary_content.toString("base64") : null,
        createdAt: row.created_at,
      },
    }
  }

  listThreads(args: {
    fromReplyAt?: string
    toReplyAtExclusive?: string
    keyword?: string
    unread?: boolean
  }): MailThreadSummary[] {
    const where: string[] = []
    const params: Array<string | number> = []

    const normalizedKeyword = args.keyword?.trim()

    const ftsQuery = (() => {
      if (!normalizedKeyword) return null
      const tokens = normalizedKeyword
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
      if (tokens.length === 0) return null
      return tokens.map((token) => `"${token.replace(/"/g, "\"\"")}"*`).join(" AND ")
    })()

    if (args.fromReplyAt || args.toReplyAtExclusive) {
      const replyDateWhere = ["rr.thread_id = t.id"]
      if (args.fromReplyAt) {
        replyDateWhere.push("rr.created_at >= ?")
        params.push(args.fromReplyAt)
      }
      if (args.toReplyAtExclusive) {
        replyDateWhere.push("rr.created_at < ?")
        params.push(args.toReplyAtExclusive)
      }
      where.push(
        `EXISTS (
          SELECT 1
          FROM mail_reply rr
          WHERE ${replyDateWhere.join(" AND ")}
        )`
      )
    }

    if (ftsQuery) {
      where.push(
        `EXISTS (
          SELECT 1
          FROM mail_search_fts ms
          WHERE ms.thread_id = t.id
            AND ms.content MATCH ?
        )`
      )
      params.push(ftsQuery)
    }

    if (args.unread) {
      where.push(
        `EXISTS (
          SELECT 1 FROM mail_reply rr
          WHERE rr.thread_id = t.id AND rr.unread = 1
        )`
      )
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""

    const rows = this.db
      .prepare(
        `
          SELECT
            t.id,
            t.thread_uid,
            t.title,
            t.created_at,
            t.updated_at,
            (
              SELECT COUNT(1)
              FROM mail_reply r
              WHERE r.thread_id = t.id AND r.unread = 1
            ) AS unread_count,
            (
              SELECT r.created_at
              FROM mail_reply r
              WHERE r.thread_id = t.id
              ORDER BY r.id DESC
              LIMIT 1
            ) AS last_reply_at,
            (
              SELECT r.content
              FROM mail_reply r
              WHERE r.thread_id = t.id
              ORDER BY r.id DESC
              LIMIT 1
            ) AS last_reply_content
          FROM mail_thread t
          ${whereSql}
          ORDER BY t.updated_at DESC, t.id DESC
        `
      )
      .all(...params) as Array<{
      id: number
      thread_uid: string
      title: string
      created_at: string
      updated_at: string
      unread_count: number
      last_reply_at: string | null
      last_reply_content: string | null
    }>

    return rows.map((row) => ({
      threadUid: row.thread_uid,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      unreadCount: row.unread_count,
      lastReplyAt: row.last_reply_at,
      lastReplySnippet: row.last_reply_content ? this.toSnippet(row.last_reply_content) : null,
    }))
  }

  markThreadRead(threadId: number): { unreadCount: number } {
    this.db
      .prepare(
        `
          UPDATE mail_reply
          SET unread = 0
          WHERE thread_id = ? AND role = 'assistant'
        `
      )
      .run(threadId)

    const row = this.db
      .prepare(
        `
          SELECT COUNT(1) AS unread_count
          FROM mail_reply
          WHERE thread_id = ? AND unread = 1
        `
      )
      .get(threadId) as { unread_count: number }

    return { unreadCount: row.unread_count }
  }

  getThreadUnreadCount(threadId: number): number {
    const row = this.db
      .prepare(
        `
          SELECT COUNT(1) AS unread_count
          FROM mail_reply
          WHERE thread_id = ? AND unread = 1
        `
      )
      .get(threadId) as { unread_count: number }
    return row.unread_count
  }

  getUnreadStats(): { totalUnreadReplies: number; totalUnreadThreads: number } {
    const repliesRow = this.db
      .prepare("SELECT COUNT(1) AS count FROM mail_reply WHERE unread = 1")
      .get() as { count: number }

    const threadsRow = this.db
      .prepare(
        `
          SELECT COUNT(1) AS count
          FROM mail_thread t
          WHERE EXISTS (
            SELECT 1 FROM mail_reply r WHERE r.thread_id = t.id AND r.unread = 1
          )
        `
      )
      .get() as { count: number }

    return {
      totalUnreadReplies: repliesRow.count,
      totalUnreadThreads: threadsRow.count,
    }
  }

  resolveModel(args: {
    requestedModel?: string | null
    configDefaultModel?: string | null
  }): string {
    if (args.requestedModel?.trim()) return args.requestedModel.trim()

    if (args.configDefaultModel?.trim()) return args.configDefaultModel.trim()
    return "gpt-5.2-chat-latest"
  }

  upsertThreadContext(args: {
    threadId: number
    summaryText: string
    summaryTokenCount: number
    lastSummarizedReplyId: number | null
  }): void {
    this.db
      .prepare(
        `
          INSERT INTO mail_thread_context (
            thread_id, summary_text, summary_token_count, last_summarized_reply_id
          )
          VALUES (?, ?, ?, ?)
          ON CONFLICT(thread_id)
          DO UPDATE SET
            summary_text = excluded.summary_text,
            summary_token_count = excluded.summary_token_count,
            last_summarized_reply_id = excluded.last_summarized_reply_id,
            updated_at = datetime('now')
        `
      )
      .run(
        args.threadId,
        args.summaryText,
        args.summaryTokenCount,
        args.lastSummarizedReplyId
      )
  }

  getThreadContext(args: { threadId: number }): {
    summaryText: string
    summaryTokenCount: number
    lastSummarizedReplyId: number | null
  } | null {
    const row = this.db
      .prepare(
        `
          SELECT summary_text, summary_token_count, last_summarized_reply_id
          FROM mail_thread_context
          WHERE thread_id = ?
        `
      )
      .get(args.threadId) as
      | {
          summary_text: string
          summary_token_count: number
          last_summarized_reply_id: number | null
        }
      | undefined

    if (!row) return null

    return {
      summaryText: row.summary_text,
      summaryTokenCount: row.summary_token_count,
      lastSummarizedReplyId: row.last_summarized_reply_id,
    }
  }

  addToolAttachments(replyId: number, attachments: MailToolAttachmentRequest[]): void {
    for (const attachment of attachments) {
      if (attachment.kind === "text") {
        this.createAttachment({
          replyId,
          filename: attachment.filename,
          kind: "text",
          mimeType: "text/plain; charset=utf-8",
          textContent: attachment.content,
          toolName: "createTextFile",
          modelQuality: attachment.modelQuality,
        })
        continue
      }

      this.createAttachment({
        replyId,
        filename: attachment.filename,
        kind: "image",
        mimeType: "image/png",
        binaryContent: null,
        toolName: "createImageFile",
        modelQuality: attachment.modelQuality,
      })
    }
  }
}
