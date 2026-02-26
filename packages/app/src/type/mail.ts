export type MailRole = "user" | "assistant" | "system"

export type MailThreadRecord = {
  id: number
  threadUid: string
  title: string
  userSetTitle: boolean
  createdAt: string
  updatedAt: string
}

export type MailReplyRecord = {
  id: number
  threadId: number
  role: MailRole
  model: string | null
  content: string
  unread: boolean
  tokenCount: number | null
  status: "pending" | "streaming" | "completed" | "error"
  errorMessage: string | null
  createdAt: string
}

export type MailAttachmentRecord = {
  id: number
  replyId: number
  slug: string
  filename: string
  kind: "text" | "image"
  mimeType: string
  textContent: string | null
  binaryContent: Buffer | null
  toolName: string | null
  modelQuality: "low" | "normal" | "high" | null
  createdAt: string
}

export type MailThreadSummary = {
  threadUid: string
  title: string
  createdAt: string
  updatedAt: string
  unreadCount: number
  lastReplyAt: string | null
  lastReplySnippet: string | null
}

export type MailThreadDetailPayload = {
  thread: MailThreadRecord
  replies: Array<
    MailReplyRecord & {
      attachmentCount: number
    }
  >
}

export type MailAttachmentSummary = Pick<
  MailAttachmentRecord,
  "id" | "replyId" | "slug" | "filename" | "kind" | "mimeType" | "createdAt"
>

export type MailReplyDetailPayload = {
  thread: MailThreadRecord
  reply: MailReplyRecord
  attachments: MailAttachmentSummary[]
}

export type MailAttachmentDetailPayload = {
  threadUid: string
  replyId: number
  attachment: {
    id: number
    slug: string
    filename: string
    kind: "text" | "image"
    mimeType: string
    textContent: string | null
    base64Content: string | null
    createdAt: string
  }
}

export type MailStreamEvent =
  | {
      type: "mail.job.started"
      jobId: number
      threadUid: string
      userReplyId: number
    }
  | {
      type: "mail.reply.created"
      threadUid: string
      replyId: number
      unreadCount: number
    }
  | {
      type: "mail.reply.failed"
      jobId: number
      threadUid: string
      message: string
    }
  | {
      type: "mail.thread.updated"
      threadUid: string
      updatedAt: string
    }
  | {
      type: "mail.unread.changed"
      threadUid: string
      unreadCount: number
      totalUnreadThreads: number
      totalUnreadReplies: number
    }

export type MailToolAttachmentRequest =
  | {
      kind: "text"
      filename: string
      modelQuality: "low" | "normal" | "high"
      content: string
    }
  | {
      kind: "image"
      filename: string
      modelQuality: "low" | "normal" | "high"
      prompt: string
    }

export type MailLLMReply = {
  content: string
  attachments: MailToolAttachmentRequest[]
}
