import { Router } from "express"
import fs from "node:fs"
import path from "node:path"
import multer from "multer"
import { AppCtx } from "../../appCtx.js"
import { MailEventHub } from "../mailWorker.js"

function parsePositiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

function parseDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined
  return trimmed
}

function parseTimezoneOffsetMinutes(value: unknown): number {
  if (typeof value !== "string") return 0
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed)) return 0
  if (parsed < -14 * 60 || parsed > 14 * 60) return 0
  return parsed
}

function toSqliteDateTimeUTC(value: Date): string {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  const day = String(value.getUTCDate()).padStart(2, "0")
  const hour = String(value.getUTCHours()).padStart(2, "0")
  const minute = String(value.getUTCMinutes()).padStart(2, "0")
  const second = String(value.getUTCSeconds()).padStart(2, "0")
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

function parseLocalDateParts(value: string): { year: number; monthIndex: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  return {
    year,
    monthIndex: month - 1,
    day,
  }
}

function getUtcRangeStartFromLocalDate(localDate: string, offsetMinutes: number): string | null {
  const parts = parseLocalDateParts(localDate)
  if (!parts) return null
  const utcMs = Date.UTC(parts.year, parts.monthIndex, parts.day, 0, 0, 0) + offsetMinutes * 60 * 1000
  return toSqliteDateTimeUTC(new Date(utcMs))
}

function getUtcRangeEndExclusiveFromLocalDate(localDate: string, offsetMinutes: number): string | null {
  const parts = parseLocalDateParts(localDate)
  if (!parts) return null
  const utcMs = Date.UTC(parts.year, parts.monthIndex, parts.day + 1, 0, 0, 0) + offsetMinutes * 60 * 1000
  return toSqliteDateTimeUTC(new Date(utcMs))
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value !== "string") return false
  return value === "1" || value.toLowerCase() === "true"
}

export function createMailRouter(ctx: AppCtx, eventHub: MailEventHub) {
  const router = Router()
  const mailDB = ctx.dbClients.mail()
  const configDB = ctx.dbClients.config()
  const iconUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 2 * 1024 * 1024,
    },
    fileFilter: (_req: unknown, file: { mimetype?: string }, callback: (error: Error | null, acceptFile?: boolean) => void) => {
      if (file.mimetype === "image/png") {
        callback(null, true)
        return
      }
      callback(new Error("Only PNG files are allowed"))
    },
  }).single("icon")

  const getContactIconDir = () => path.join(ctx.config.app.storagePath, "contact", "icons")
  const getContactIconPath = (location: string) => path.join(getContactIconDir(), location)

  router.get("/mail/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    const lastEventIdRaw = req.header("Last-Event-ID") || req.query.lastEventId
    const lastEventId =
      typeof lastEventIdRaw === "string" ? Number.parseInt(lastEventIdRaw, 10) : 0

    const replayEvents = Number.isInteger(lastEventId) && lastEventId > 0
      ? eventHub.replayAfter(lastEventId)
      : []

    for (const item of replayEvents) {
      res.write(`id: ${item.id}\n`)
      res.write(`event: ${item.event.type}\n`)
      res.write(`data: ${JSON.stringify(item.event)}\n\n`)
    }

    const unsubscribe = eventHub.subscribe(({ id, event }) => {
      res.write(`id: ${id}\n`)
      res.write(`event: ${event.type}\n`)
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    })

    const heartbeat = setInterval(() => {
      res.write(": ping\n\n")
    }, 15000)

    req.on("close", () => {
      clearInterval(heartbeat)
      unsubscribe()
      res.end()
    })
  })

  router.get("/mail/contact", (req, res) => {
    res.json({ contacts: mailDB.listContacts() })
  })

  router.post("/mail/contact", (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name : ""
    if (!name.trim()) {
      res.status(400).json({ error: "name is required" })
      return
    }

    try {
      const contact = mailDB.createContact({
        slug: typeof req.body?.slug === "string" ? req.body.slug : undefined,
        name,
        instruction:
          typeof req.body?.instruction === "string" ? req.body.instruction : undefined,
        icon: typeof req.body?.icon === "string" ? req.body.icon : undefined,
        color: typeof req.body?.color === "string" ? req.body.color : undefined,
        defaultModel:
          typeof req.body?.defaultModel === "string" ? req.body.defaultModel : undefined,
      })

      res.json({ contact })
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to create contact",
      })
    }
  })

  router.get("/mail/contact/:slug", (req, res) => {
    const slug = req.params.slug?.trim()
    if (!slug) {
      res.status(400).json({ error: "slug is required" })
      return
    }

    const contact = mailDB.getContactBySlug(slug)
    if (!contact) {
      res.status(404).json({ error: "contact not found" })
      return
    }

    res.json({ contact })
  })

  router.put("/mail/contact/:slug", (req, res) => {
    const slug = req.params.slug?.trim()
    if (!slug) {
      res.status(400).json({ error: "slug is required" })
      return
    }

    try {
      const previousContact = mailDB.getContactBySlug(slug)
      if (!previousContact) {
        res.status(404).json({ error: "contact not found" })
        return
      }

      const contact = mailDB.updateContactBySlug(slug, {
        slug: typeof req.body?.slug === "string" ? req.body.slug : undefined,
        name: typeof req.body?.name === "string" ? req.body.name : undefined,
        instruction:
          typeof req.body?.instruction === "string" ? req.body.instruction : undefined,
        icon: typeof req.body?.icon === "string" ? req.body.icon : undefined,
        color: typeof req.body?.color === "string" ? req.body.color : undefined,
        defaultModel:
          typeof req.body?.defaultModel === "string" ? req.body.defaultModel : undefined,
      })

      if (!contact) {
        res.status(404).json({ error: "contact not found" })
        return
      }

      if (
        previousContact.iconLocation &&
        contact.iconLocation &&
        previousContact.iconLocation !== contact.iconLocation
      ) {
        const previousPath = getContactIconPath(previousContact.iconLocation)
        const nextPath = getContactIconPath(contact.iconLocation)
        if (fs.existsSync(previousPath)) {
          fs.mkdirSync(path.dirname(nextPath), { recursive: true })
          if (fs.existsSync(nextPath)) {
            fs.rmSync(nextPath, { force: true })
          }
          fs.renameSync(previousPath, nextPath)
        }
      }

      res.json({ contact })
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to update contact",
      })
    }
  })

  router.put("/mail/contact/:slug/icon", (req, res) => {
    iconUpload(req, res, (uploadError: unknown) => {
      if (uploadError) {
        if (
          uploadError instanceof multer.MulterError &&
          (uploadError as { code?: string }).code === "LIMIT_FILE_SIZE"
        ) {
          res.status(400).json({ error: "Icon file exceeds 2MB limit" })
          return
        }
        res.status(400).json({
          error: uploadError instanceof Error ? uploadError.message : "Invalid icon upload",
        })
        return
      }

      const slug = req.params.slug?.trim()
      if (!slug) {
        res.status(400).json({ error: "slug is required" })
        return
      }

      const contact = mailDB.getContactBySlug(slug)
      if (!contact) {
        res.status(404).json({ error: "contact not found" })
        return
      }

      const file = (req as { file?: { buffer: Buffer } }).file
      if (!file) {
        res.status(400).json({ error: "icon file is required" })
        return
      }

      const iconLocation = contact.iconLocation || `${contact.id}-${contact.slug}.png`
      const iconPath = getContactIconPath(iconLocation)
      fs.mkdirSync(path.dirname(iconPath), { recursive: true })
      fs.writeFileSync(iconPath, file.buffer)

      const updated = mailDB.getContactById(contact.id)
      res.json({ contact: updated })
    })
  })

  router.get("/mail/contact/:slug/icon", (req, res) => {
    const slug = req.params.slug?.trim()
    if (!slug) {
      res.status(400).json({ error: "slug is required" })
      return
    }

    const contact = mailDB.getContactBySlug(slug)
    if (!contact || !contact.iconLocation) {
      res.status(404).json({ error: "icon not found" })
      return
    }

    const iconPath = getContactIconPath(contact.iconLocation)
    if (!fs.existsSync(iconPath)) {
      res.status(404).json({ error: "icon not found" })
      return
    }

    res.setHeader("Content-Type", "image/png")
    res.sendFile(iconPath)
  })

  router.get("/mail/thread", (req, res) => {
    const fromDate = parseDate(req.query.from)
    const toDate = parseDate(req.query.to)
    const tzOffsetMinutes = parseTimezoneOffsetMinutes(req.query.tzOffsetMinutes)

    const fromReplyAt = fromDate ? getUtcRangeStartFromLocalDate(fromDate, tzOffsetMinutes) : undefined
    const toReplyAtExclusive = toDate ? getUtcRangeEndExclusiveFromLocalDate(toDate, tzOffsetMinutes) : undefined

    const payload = mailDB.listThreads({
      contactSlug:
        typeof req.query.contact === "string" ? req.query.contact.trim() || undefined : undefined,
      fromReplyAt: fromReplyAt || undefined,
      toReplyAtExclusive: toReplyAtExclusive || undefined,
      keyword: typeof req.query.keyword === "string" ? req.query.keyword.trim() || undefined : undefined,
      unread: parseBooleanFlag(req.query.unread),
    })

    const stats = mailDB.getUnreadStats()
    res.json({ threads: payload, unread: stats })
  })

  router.post("/mail/thread", (req, res) => {
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : ""
    if (!content) {
      res.status(400).json({ error: "content is required" })
      return
    }

    const contactSlug = typeof req.body?.contactSlug === "string" ? req.body.contactSlug.trim() : ""
    const contact = contactSlug ? mailDB.getContactBySlug(contactSlug) : null

    if (contactSlug && !contact) {
      res.status(400).json({ error: "contact not found" })
      return
    }

    const thread = mailDB.createThread({
      title: typeof req.body?.title === "string" ? req.body.title : "",
    })

    const userReply = mailDB.createReply({
      threadId: thread.id,
      role: "user",
      contactId: contact?.id ?? null,
      model: typeof req.body?.model === "string" ? req.body.model : null,
      content,
      unread: false,
      status: "completed",
    })

    if (Array.isArray(req.body?.attachments)) {
      for (const candidate of req.body.attachments as Array<Record<string, unknown>>) {
        if (!candidate || typeof candidate !== "object") continue
        const filename = typeof candidate.filename === "string" ? candidate.filename : "attachment"
        const kind = candidate.kind === "image" ? "image" : "text"

        if (kind === "text") {
          const textContent = typeof candidate.textContent === "string" ? candidate.textContent : ""
          mailDB.createAttachment({
            replyId: userReply.id,
            filename,
            kind: "text",
            mimeType: "text/plain; charset=utf-8",
            textContent,
            toolName: "user_upload",
          })
        } else {
          const base64 = typeof candidate.base64Content === "string" ? candidate.base64Content : ""
          const mimeType = typeof candidate.mimeType === "string" ? candidate.mimeType : "image/png"
          const binary = base64 ? Buffer.from(base64, "base64") : null
          if (!binary) continue
          mailDB.createAttachment({
            replyId: userReply.id,
            filename,
            kind: "image",
            mimeType,
            binaryContent: binary,
            toolName: "user_upload",
          })
        }
      }
    }

    const job = mailDB.queueJob({
      threadId: thread.id,
      userReplyId: userReply.id,
      requestedContactId: contact?.id ?? null,
      requestedModel: typeof req.body?.model === "string" ? req.body.model : null,
    })

    eventHub.emit({
      type: "mail.thread.updated",
      threadUid: thread.threadUid,
      updatedAt: new Date().toISOString(),
    })

    res.json({
      threadUid: thread.threadUid,
      userReplyId: userReply.id,
      jobId: job.id,
    })
  })

  router.get("/mail/thread/:thread_uid", (req, res) => {
    const payload = mailDB.getThreadDetailByUid(req.params.thread_uid)
    if (!payload) {
      res.status(404).json({ error: "thread not found" })
      return
    }

    res.json(payload)
  })

  router.post("/mail/thread/:thread_uid/reply", (req, res) => {
    const thread = mailDB.getThreadByUid(req.params.thread_uid)
    if (!thread) {
      res.status(404).json({ error: "thread not found" })
      return
    }

    const content = typeof req.body?.content === "string" ? req.body.content.trim() : ""
    if (!content) {
      res.status(400).json({ error: "content is required" })
      return
    }

    const contactSlug = typeof req.body?.contactSlug === "string" ? req.body.contactSlug.trim() : ""
    const contact = contactSlug ? mailDB.getContactBySlug(contactSlug) : null

    if (contactSlug && !contact) {
      res.status(400).json({ error: "contact not found" })
      return
    }

    const reply = mailDB.createReply({
      threadId: thread.id,
      role: "user",
      contactId: contact?.id ?? null,
      model: typeof req.body?.model === "string" ? req.body.model : null,
      content,
      unread: false,
      status: "completed",
    })

    const job = mailDB.queueJob({
      threadId: thread.id,
      userReplyId: reply.id,
      requestedContactId: contact?.id ?? null,
      requestedModel: typeof req.body?.model === "string" ? req.body.model : null,
    })

    eventHub.emit({
      type: "mail.thread.updated",
      threadUid: thread.threadUid,
      updatedAt: new Date().toISOString(),
    })

    res.json({ threadUid: thread.threadUid, userReplyId: reply.id, jobId: job.id })
  })

  router.post("/mail/thread/:thread_uid/read", (req, res) => {
    const thread = mailDB.getThreadByUid(req.params.thread_uid)
    if (!thread) {
      res.status(404).json({ error: "thread not found" })
      return
    }

    const result = mailDB.markThreadRead(thread.id)
    const unreadStats = mailDB.getUnreadStats()

    eventHub.emit({
      type: "mail.unread.changed",
      threadUid: thread.threadUid,
      unreadCount: result.unreadCount,
      totalUnreadReplies: unreadStats.totalUnreadReplies,
      totalUnreadThreads: unreadStats.totalUnreadThreads,
    })

    res.json({
      unreadCount: result.unreadCount,
      totalUnreadReplies: unreadStats.totalUnreadReplies,
      totalUnreadThreads: unreadStats.totalUnreadThreads,
    })
  })

  router.get("/mail/thread/:thread_uid/attachment", (req, res) => {
    const thread = mailDB.getThreadByUid(req.params.thread_uid)
    if (!thread) {
      res.status(404).json({ error: "thread not found" })
      return
    }

    res.json({
      thread,
      attachments: mailDB.listThreadAttachments(thread.id),
    })
  })

  router.get("/mail/thread/:thread_uid/reply/:reply_id", (req, res) => {
    const replyId = parsePositiveInt(req.params.reply_id)
    if (!replyId) {
      res.status(400).json({ error: "Invalid reply id" })
      return
    }

    const payload = mailDB.getReplyDetail({
      threadUid: req.params.thread_uid,
      replyId,
    })

    if (!payload) {
      res.status(404).json({ error: "reply not found" })
      return
    }

    res.json(payload)
  })

  router.get(
    "/mail/thread/:thread_uid/reply/:reply_id/attachment/:attachment_slug",
    (req, res) => {
      const replyId = parsePositiveInt(req.params.reply_id)
      if (!replyId) {
        res.status(400).json({ error: "Invalid reply id" })
        return
      }

      const payload = mailDB.getAttachmentDetail({
        threadUid: req.params.thread_uid,
        replyId,
        attachmentSlug: req.params.attachment_slug,
      })

      if (!payload) {
        res.status(404).json({ error: "attachment not found" })
        return
      }

      res.json(payload)
    }
  )

  router.get("/mail/config/model-candidates", (req, res) => {
    const raw = configDB.getValue("chat.models")
    try {
      const value = raw ? JSON.parse(raw) : []
      if (Array.isArray(value)) {
        const candidates = value.filter((item): item is string => typeof item === "string")
        res.json({ models: candidates })
        return
      }
    } catch {
      // ignored
    }

    res.json({
      models: [
        "gpt-5.2",
        "gpt-5.1",
        "gpt-5",
        "gpt-5-mini",
        "gpt-5-nano",
        "gpt-5.2-chat-latest",
        "gpt-5.1-chat-latest",
        "gpt-5-chat-latest",
        "gpt-5.2-codex",
        "gpt-5.1-codex-max",
        "gpt-5.1-codex",
        "gpt-5-codex",
        "gpt-5.2-pro",
        "gpt-5-pro",
        "gpt-4.1",
        "gpt-4.1-mini",
        "gpt-4.1-nano",
        "gpt-4o",
        "gpt-4o-2024-05-13",
        "gpt-4o-mini",
      ],
    })
  })

  router.get("/mail/config/composer", (req, res) => {
    const defaultContactRaw = configDB.getValue("mail.default_contact")
    const defaultContact = defaultContactRaw?.trim() || null
    res.json({ defaultContact })
  })

  return router
}
