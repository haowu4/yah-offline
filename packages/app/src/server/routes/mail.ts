import { Router } from "express"
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
  return trimmed
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value !== "string") return false
  return value === "1" || value.toLowerCase() === "true"
}

export function createMailRouter(ctx: AppCtx, eventHub: MailEventHub) {
  const router = Router()
  const mailDB = ctx.dbClients.mail()
  const configDB = ctx.dbClients.config()

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

      res.json({ contact })
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to update contact",
      })
    }
  })

  router.get("/mail/thread", (req, res) => {
    const payload = mailDB.listThreads({
      contactSlug:
        typeof req.query.contact === "string" ? req.query.contact.trim() || undefined : undefined,
      from: parseDate(req.query.from),
      to: parseDate(req.query.to),
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

    res.json({ models: ["gpt-4.1-mini"] })
  })

  return router
}
