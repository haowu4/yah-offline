import type Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import {
  MailAttachmentDetailPayload,
  MailAttachmentRecord,
  MailAttachmentSummary,
  MailContactRecord,
  MailJobRecord,
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
  contact_id: number | null
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
    contactId: row.contact_id,
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

  private getUniqueContactSlug(base: string, excludeId?: number): string {
    const normalizedBase = slugify(base)
    let candidate = normalizedBase
    let index = 2

    while (true) {
      const row = this.db
        .prepare(
          `
            SELECT id FROM mail_contact
            WHERE slug = ?
          `
        )
        .get(candidate) as { id: number } | undefined

      if (!row) return candidate
      if (excludeId && row.id === excludeId) return candidate
      candidate = `${normalizedBase}-${index}`
      index += 1
    }
  }

  listContacts(): MailContactRecord[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, slug, name, instruction, icon, color, default_model, created_at, updated_at
          FROM mail_contact
          ORDER BY name COLLATE NOCASE ASC, id ASC
        `
      )
      .all() as Array<{
      id: number
      slug: string
      name: string
      instruction: string
      icon: string
      color: string
      default_model: string | null
      created_at: string
      updated_at: string
    }>

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      instruction: row.instruction,
      icon: row.icon,
      color: row.color,
      defaultModel: row.default_model,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  createContact(args: {
    slug?: string
    name: string
    instruction?: string
    icon?: string
    color?: string
    defaultModel?: string | null
  }): MailContactRecord {
    const name = args.name.trim()
    if (!name) throw new Error("Contact name is required")

    const desiredSlug = args.slug?.trim() || name
    const slug = this.getUniqueContactSlug(desiredSlug)
    const instruction = args.instruction?.trim() ?? ""
    const icon = args.icon?.trim() || "user"
    const color = args.color?.trim() || "#6b7280"
    const defaultModel = args.defaultModel?.trim() || null

    const result = this.db
      .prepare(
        `
          INSERT INTO mail_contact (slug, name, instruction, icon, color, default_model)
          VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run(slug, name, instruction, icon, color, defaultModel)

    return this.getContactById(result.lastInsertRowid as number)
  }

  getContactBySlug(slug: string): MailContactRecord | null {
    const normalized = slug.trim()
    if (!normalized) return null

    const row = this.db
      .prepare(
        `
          SELECT id, slug, name, instruction, icon, color, default_model, created_at, updated_at
          FROM mail_contact
          WHERE slug = ?
        `
      )
      .get(normalized) as
      | {
          id: number
          slug: string
          name: string
          instruction: string
          icon: string
          color: string
          default_model: string | null
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) return null

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      instruction: row.instruction,
      icon: row.icon,
      color: row.color,
      defaultModel: row.default_model,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  getContactById(id: number): MailContactRecord {
    const row = this.getContactBySlug(
      (
        this.db
          .prepare("SELECT slug FROM mail_contact WHERE id = ?")
          .get(id) as { slug: string } | undefined
      )?.slug ?? ""
    )

    if (!row) throw new Error("Contact not found")
    return row
  }

  updateContactBySlug(
    slug: string,
    args: {
      slug?: string
      name?: string
      instruction?: string
      icon?: string
      color?: string
      defaultModel?: string | null
    }
  ): MailContactRecord | null {
    const current = this.getContactBySlug(slug)
    if (!current) return null

    const nextName = args.name == null ? current.name : args.name.trim()
    if (!nextName) throw new Error("Contact name is required")

    const nextSlug =
      args.slug == null
        ? current.slug
        : this.getUniqueContactSlug(args.slug.trim() || current.slug, current.id)

    const nextInstruction = args.instruction == null ? current.instruction : args.instruction.trim()
    const nextIcon = args.icon == null ? current.icon : args.icon.trim() || "user"
    const nextColor = args.color == null ? current.color : args.color.trim() || "#6b7280"
    const nextDefaultModel =
      args.defaultModel == null ? current.defaultModel : args.defaultModel?.trim() || null

    this.db
      .prepare(
        `
          UPDATE mail_contact
          SET slug = ?,
              name = ?,
              instruction = ?,
              icon = ?,
              color = ?,
              default_model = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `
      )
      .run(
        nextSlug,
        nextName,
        nextInstruction,
        nextIcon,
        nextColor,
        nextDefaultModel,
        current.id
      )

    return this.getContactById(current.id)
  }

  createThread(args?: { title?: string }): MailThreadRecord {
    const threadUid = randomUUID()
    const title = args?.title?.trim() ?? ""

    const result = this.db
      .prepare(
        `
          INSERT INTO mail_thread (thread_uid, title)
          VALUES (?, ?)
        `
      )
      .run(threadUid, title)

    return this.getThreadByIdStrict(result.lastInsertRowid as number)
  }

  getThreadByUid(threadUid: string): MailThreadRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT id, thread_uid, title, created_at, updated_at
          FROM mail_thread
          WHERE thread_uid = ?
        `
      )
      .get(threadUid) as
      | {
          id: number
          thread_uid: string
          title: string
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) return null

    return {
      id: row.id,
      threadUid: row.thread_uid,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private getThreadByIdStrict(id: number): MailThreadRecord {
    const row = this.db
      .prepare(
        `
          SELECT id, thread_uid, title, created_at, updated_at
          FROM mail_thread
          WHERE id = ?
        `
      )
      .get(id) as
      | {
          id: number
          thread_uid: string
          title: string
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) throw new Error("Thread not found")

    return {
      id: row.id,
      threadUid: row.thread_uid,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  getThreadById(id: number): MailThreadRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT id, thread_uid, title, created_at, updated_at
          FROM mail_thread
          WHERE id = ?
        `
      )
      .get(id) as
      | {
          id: number
          thread_uid: string
          title: string
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) return null

    return {
      id: row.id,
      threadUid: row.thread_uid,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  updateThreadTitle(threadId: number, title: string): void {
    this.db
      .prepare(
        `
          UPDATE mail_thread
          SET title = ?, updated_at = datetime('now')
          WHERE id = ?
        `
      )
      .run(title.trim(), threadId)
  }

  touchThread(threadId: number): void {
    this.db
      .prepare("UPDATE mail_thread SET updated_at = datetime('now') WHERE id = ?")
      .run(threadId)
  }

  createReply(args: {
    threadId: number
    role: "user" | "assistant" | "system"
    contactId?: number | null
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
            thread_id, role, contact_id, model, content, unread, token_count, status, error_message
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        args.threadId,
        args.role,
        args.contactId ?? null,
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
          SELECT id, thread_id, role, contact_id, model, content, unread, token_count, status, error_message, created_at
          FROM mail_reply
          WHERE id = ?
        `
      )
      .get(replyId) as
      | {
          id: number
          thread_id: number
          role: "user" | "assistant" | "system"
          contact_id: number | null
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
          SELECT id, thread_id, role, contact_id, model, content, unread, token_count, status, error_message, created_at
          FROM mail_reply
          WHERE thread_id = ?
          ORDER BY id ASC
        `
      )
      .all(threadId) as Array<{
      id: number
      thread_id: number
      role: "user" | "assistant" | "system"
      contact_id: number | null
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
            r.contact_id,
            r.model,
            r.content,
            r.unread,
            r.token_count,
            r.status,
            r.error_message,
            r.created_at,
            c.slug AS contact_slug,
            c.name AS contact_name,
            c.color AS contact_color,
            c.icon AS contact_icon,
            (SELECT COUNT(1) FROM mail_attachment a WHERE a.reply_id = r.id) AS attachment_count
          FROM mail_reply r
          LEFT JOIN mail_contact c ON c.id = r.contact_id
          WHERE r.thread_id = ?
          ORDER BY r.id ASC
        `
      )
      .all(thread.id) as Array<{
      id: number
      thread_id: number
      role: "user" | "assistant" | "system"
      contact_id: number | null
      model: string | null
      content: string
      unread: number
      token_count: number | null
      status: "pending" | "streaming" | "completed" | "error"
      error_message: string | null
      created_at: string
      contact_slug: string | null
      contact_name: string | null
      contact_color: string | null
      contact_icon: string | null
      attachment_count: number
    }>

    return {
      thread,
      replies: rows.map((row) => ({
        ...toReplyRecord(row),
        attachmentCount: row.attachment_count,
        contact:
          row.contact_id == null || !row.contact_slug || !row.contact_name || !row.contact_color || !row.contact_icon
            ? null
            : {
                id: row.contact_id,
                slug: row.contact_slug,
                name: row.contact_name,
                color: row.contact_color,
                icon: row.contact_icon,
              },
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
            r.contact_id,
            r.model,
            r.content,
            r.unread,
            r.token_count,
            r.status,
            r.error_message,
            r.created_at,
            c.slug AS contact_slug,
            c.name AS contact_name,
            c.color AS contact_color,
            c.icon AS contact_icon
          FROM mail_reply r
          LEFT JOIN mail_contact c ON c.id = r.contact_id
          WHERE r.id = ? AND r.thread_id = ?
        `
      )
      .get(args.replyId, thread.id) as
      | {
          id: number
          thread_id: number
          role: "user" | "assistant" | "system"
          contact_id: number | null
          model: string | null
          content: string
          unread: number
          token_count: number | null
          status: "pending" | "streaming" | "completed" | "error"
          error_message: string | null
          created_at: string
          contact_slug: string | null
          contact_name: string | null
          contact_color: string | null
          contact_icon: string | null
        }
      | undefined

    if (!row) return null

    return {
      thread,
      reply: {
        ...toReplyRecord(row),
        contact:
          row.contact_id == null || !row.contact_slug || !row.contact_name || !row.contact_color || !row.contact_icon
            ? null
            : {
                id: row.contact_id,
                slug: row.contact_slug,
                name: row.contact_name,
                color: row.contact_color,
                icon: row.contact_icon,
              },
      },
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
    contactSlug?: string
    from?: string
    to?: string
    keyword?: string
    unread?: boolean
  }): MailThreadSummary[] {
    const where: string[] = []
    const params: Array<string | number> = []

    if (args.contactSlug) {
      where.push(
        `EXISTS (
          SELECT 1
          FROM mail_reply rr
          JOIN mail_contact cc ON cc.id = rr.contact_id
          WHERE rr.thread_id = t.id AND cc.slug = ?
        )`
      )
      params.push(args.contactSlug)
    }

    if (args.from) {
      where.push("t.updated_at >= ?")
      params.push(args.from)
    }

    if (args.to) {
      where.push("t.updated_at <= ?")
      params.push(args.to)
    }

    if (args.keyword) {
      where.push(
        `(
          t.title LIKE ?
          OR EXISTS (
              SELECT 1 FROM mail_reply rr
              WHERE rr.thread_id = t.id AND rr.content LIKE ?
          )
        )`
      )
      const pattern = `%${args.keyword}%`
      params.push(pattern, pattern)
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
              SELECT substr(trim(replace(replace(r.content, '\n', ' '), '\r', ' ')), 1, 220)
              FROM mail_reply r
              WHERE r.thread_id = t.id
              ORDER BY r.id DESC
              LIMIT 1
            ) AS last_reply_snippet
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
      last_reply_snippet: string | null
    }>

    return rows.map((row) => {
      const contacts = this.db
        .prepare(
          `
            SELECT DISTINCT c.slug, c.name, c.color, c.icon
            FROM mail_reply r
            JOIN mail_contact c ON c.id = r.contact_id
            WHERE r.thread_id = ?
            ORDER BY c.name COLLATE NOCASE ASC
          `
        )
        .all(row.id) as Array<{ slug: string; name: string; color: string; icon: string }>

      return {
        threadUid: row.thread_uid,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        unreadCount: row.unread_count,
        lastReplyAt: row.last_reply_at,
        lastReplySnippet: row.last_reply_snippet,
        contacts,
      }
    })
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

  queueJob(args: {
    threadId: number
    userReplyId: number
    requestedContactId?: number | null
    requestedModel?: string | null
  }): MailJobRecord {
    const result = this.db
      .prepare(
        `
          INSERT INTO mail_job (thread_id, user_reply_id, requested_contact_id, requested_model)
          VALUES (?, ?, ?, ?)
        `
      )
      .run(
        args.threadId,
        args.userReplyId,
        args.requestedContactId ?? null,
        args.requestedModel?.trim() || null
      )

    return this.getJobById(result.lastInsertRowid as number)
  }

  getJobById(jobId: number): MailJobRecord {
    const row = this.db
      .prepare(
        `
          SELECT id, thread_id, user_reply_id, requested_contact_id, requested_model, status, error_message,
                 run_after, started_at, finished_at, created_at
          FROM mail_job
          WHERE id = ?
        `
      )
      .get(jobId) as
      | {
          id: number
          thread_id: number
          user_reply_id: number
          requested_contact_id: number | null
          requested_model: string | null
          status: "queued" | "running" | "completed" | "failed"
          error_message: string | null
          run_after: string
          started_at: string | null
          finished_at: string | null
          created_at: string
        }
      | undefined

    if (!row) throw new Error("Job not found")

    return {
      id: row.id,
      threadId: row.thread_id,
      userReplyId: row.user_reply_id,
      requestedContactId: row.requested_contact_id,
      requestedModel: row.requested_model,
      status: row.status,
      errorMessage: row.error_message,
      runAfter: row.run_after,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      createdAt: row.created_at,
    }
  }

  claimNextQueuedJob(): MailJobRecord | null {
    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare(
          `
            SELECT id
            FROM mail_job
            WHERE status = 'queued' AND run_after <= datetime('now')
            ORDER BY id ASC
            LIMIT 1
          `
        )
        .get() as { id: number } | undefined

      if (!row) return null

      const updated = this.db
        .prepare(
          `
            UPDATE mail_job
            SET status = 'running', started_at = datetime('now')
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
          UPDATE mail_job
          SET status = 'completed', error_message = NULL, finished_at = datetime('now')
          WHERE id = ?
        `
      )
      .run(jobId)
  }

  failJob(jobId: number, message: string): void {
    this.db
      .prepare(
        `
          UPDATE mail_job
          SET status = 'failed', error_message = ?, finished_at = datetime('now')
          WHERE id = ?
        `
      )
      .run(message, jobId)
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

  appendEvent(eventType: string, payloadJson: string): number {
    const result = this.db
      .prepare(
        `
          INSERT INTO mail_event (event_type, payload_json)
          VALUES (?, ?)
        `
      )
      .run(eventType, payloadJson)

    return result.lastInsertRowid as number
  }

  listEventsAfterId(lastId: number): Array<{
    id: number
    eventType: string
    payloadJson: string
    createdAt: string
  }> {
    const rows = this.db
      .prepare(
        `
          SELECT id, event_type, payload_json, created_at
          FROM mail_event
          WHERE id > ?
          ORDER BY id ASC
          LIMIT 500
        `
      )
      .all(lastId) as Array<{
      id: number
      event_type: string
      payload_json: string
      created_at: string
    }>

    return rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        payloadJson: row.payload_json,
        createdAt: row.created_at,
      }))
  }

  resolveModel(args: {
    requestedModel?: string | null
    contactId?: number | null
    configDefaultModel?: string | null
  }): string {
    if (args.requestedModel?.trim()) return args.requestedModel.trim()

    if (args.contactId) {
      const row = this.db
        .prepare("SELECT default_model FROM mail_contact WHERE id = ?")
        .get(args.contactId) as { default_model: string | null } | undefined
      if (row?.default_model?.trim()) return row.default_model.trim()
    }

    if (args.configDefaultModel?.trim()) return args.configDefaultModel.trim()
    return "gpt-4.1-mini"
  }

  upsertThreadContactContext(args: {
    threadId: number
    contactId: number
    summaryText: string
    summaryTokenCount: number
    lastSummarizedReplyId: number | null
  }): void {
    this.db
      .prepare(
        `
          INSERT INTO mail_thread_contact_context (
            thread_id, contact_id, summary_text, summary_token_count, last_summarized_reply_id
          )
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(thread_id, contact_id)
          DO UPDATE SET
            summary_text = excluded.summary_text,
            summary_token_count = excluded.summary_token_count,
            last_summarized_reply_id = excluded.last_summarized_reply_id,
            updated_at = datetime('now')
        `
      )
      .run(
        args.threadId,
        args.contactId,
        args.summaryText,
        args.summaryTokenCount,
        args.lastSummarizedReplyId
      )
  }

  getThreadContactContext(args: { threadId: number; contactId: number }): {
    summaryText: string
    summaryTokenCount: number
    lastSummarizedReplyId: number | null
  } | null {
    const row = this.db
      .prepare(
        `
          SELECT summary_text, summary_token_count, last_summarized_reply_id
          FROM mail_thread_contact_context
          WHERE thread_id = ? AND contact_id = ?
        `
      )
      .get(args.threadId, args.contactId) as
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
