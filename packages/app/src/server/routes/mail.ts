import { Router } from "express"
import { AppCtx } from "../../appCtx.js"
import { EventDispatcher } from "../llm/eventDispatcher.js"
import { logDebugJson, logLine } from "../../logging/index.js"

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

export function createMailRouter(ctx: AppCtx, eventDispatcher: EventDispatcher) {
  const router = Router()
  const mailDB = ctx.dbClients.mail()
  const llmDB = ctx.dbClients.llm()
  const configDB = ctx.dbClients.config()

  router.get("/mail/thread/:thread_uid/stream", (req, res) => {
    const thread = mailDB.getThreadByUid(req.params.thread_uid)
    if (!thread) {
      res.status(404).json({ error: "thread not found" })
      return
    }

    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()
    const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : "-"
    const streamPath = req.originalUrl || req.url || req.path
    logLine("info", `SSE IN  ${streamPath} rid=${requestId}`)
    logDebugJson(ctx.config.app.debug, {
      event: "http.sse.in",
      requestId,
      path: streamPath,
    })

    const lastEventIdRaw = req.header("Last-Event-ID") || req.query.lastEventId
    const lastEventId =
      typeof lastEventIdRaw === "string" ? Number.parseInt(lastEventIdRaw, 10) : 0

    const replayEvents = Number.isInteger(lastEventId) && lastEventId > 0
      ? eventDispatcher.replayAfter({
          topic: "mail",
          lastEventId,
          entityId: thread.threadUid,
        })
      : []

    for (const item of replayEvents) {
      res.write(`id: ${item.id}\n`)
      res.write(`event: ${item.event.type}\n`)
      res.write(`data: ${JSON.stringify(item.event)}\n\n`)
    }

    const unsubscribe = eventDispatcher.subscribe({
      topic: "mail",
      entityId: thread.threadUid,
      send: ({ id, event }) => {
        res.write(`id: ${id}\n`)
        res.write(`event: ${event.type}\n`)
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      },
    })

    const heartbeat = setInterval(() => {
      res.write(": ping\n\n")
    }, 15000)

    req.on("close", () => {
      clearInterval(heartbeat)
      unsubscribe()
      logLine("info", `SSE OUT ${streamPath} rid=${requestId}`)
      logDebugJson(ctx.config.app.debug, {
        event: "http.sse.out",
        requestId,
        path: streamPath,
      })
      res.end()
    })
  })

  router.get("/mail/thread", (req, res) => {
    const fromDate = parseDate(req.query.from)
    const toDate = parseDate(req.query.to)
    const tzOffsetMinutes = parseTimezoneOffsetMinutes(req.query.tzOffsetMinutes)

    const fromReplyAt = fromDate ? getUtcRangeStartFromLocalDate(fromDate, tzOffsetMinutes) : undefined
    const toReplyAtExclusive = toDate ? getUtcRangeEndExclusiveFromLocalDate(toDate, tzOffsetMinutes) : undefined

    const payload = mailDB.listThreads({
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

    const thread = mailDB.createThread({
      title: typeof req.body?.title === "string" ? req.body.title : "",
    })

    const userReply = mailDB.createReply({
      threadId: thread.id,
      role: "user",
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

    const job = llmDB.enqueueJob({
      kind: "mail.reply",
      entityId: thread.threadUid,
      priority: 50,
      payload: {
        threadId: thread.id,
        userReplyId: userReply.id,
        requestedModel: typeof req.body?.model === "string" ? req.body.model : null,
      },
    })

    eventDispatcher.emit({
      topic: "mail",
      entityId: thread.threadUid,
      event: {
        type: "mail.thread.updated",
        threadUid: thread.threadUid,
        updatedAt: new Date().toISOString(),
      },
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

  router.put("/mail/thread/:thread_uid", (req, res) => {
    const thread = mailDB.getThreadByUid(req.params.thread_uid)
    if (!thread) {
      res.status(404).json({ error: "thread not found" })
      return
    }

    if (typeof req.body?.title !== "string") {
      res.status(400).json({ error: "title is required" })
      return
    }

    mailDB.updateThreadTitle(thread.id, req.body.title, { userSetTitle: true })
    const updated = mailDB.getThreadById(thread.id)

    eventDispatcher.emit({
      topic: "mail",
      entityId: thread.threadUid,
      event: {
        type: "mail.thread.updated",
        threadUid: thread.threadUid,
        updatedAt: updated?.updatedAt ?? new Date().toISOString(),
      },
    })

    res.json({
      thread: updated,
    })
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

    const reply = mailDB.createReply({
      threadId: thread.id,
      role: "user",
      model: typeof req.body?.model === "string" ? req.body.model : null,
      content,
      unread: false,
      status: "completed",
    })

    const job = llmDB.enqueueJob({
      kind: "mail.reply",
      entityId: thread.threadUid,
      priority: 50,
      payload: {
        threadId: thread.id,
        userReplyId: reply.id,
        requestedModel: typeof req.body?.model === "string" ? req.body.model : null,
      },
    })

    eventDispatcher.emit({
      topic: "mail",
      entityId: thread.threadUid,
      event: {
        type: "mail.thread.updated",
        threadUid: thread.threadUid,
        updatedAt: new Date().toISOString(),
      },
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

    eventDispatcher.emit({
      topic: "mail",
      entityId: thread.threadUid,
      event: {
        type: "mail.unread.changed",
        threadUid: thread.threadUid,
        unreadCount: result.unreadCount,
        totalUnreadReplies: unreadStats.totalUnreadReplies,
        totalUnreadThreads: unreadStats.totalUnreadThreads,
      },
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
    const raw = configDB.getValue("llm.models")
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

  return router
}
