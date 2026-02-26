const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  const isFormDataBody = typeof FormData !== 'undefined' && init?.body instanceof FormData
  if (!isFormDataBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export type MailStreamEvent =
  | {
      type: 'mail.job.started'
      jobId: number
      threadUid: string
      userReplyId: number
    }
  | {
      type: 'mail.reply.created'
      threadUid: string
      replyId: number
      unreadCount: number
    }
  | {
      type: 'mail.reply.failed'
      jobId: number
      threadUid: string
      message: string
    }
  | {
      type: 'mail.thread.updated'
      threadUid: string
      updatedAt: string
    }
  | {
      type: 'mail.unread.changed'
      threadUid: string
      unreadCount: number
      totalUnreadThreads: number
      totalUnreadReplies: number
    }

export type ApiMailThreadSummary = {
  threadUid: string
  title: string
  createdAt: string
  updatedAt: string
  unreadCount: number
  lastReplyAt: string | null
  lastReplySnippet: string | null
}

export type ApiMailReply = {
  id: number
  threadId: number
  role: 'user' | 'assistant' | 'system'
  model: string | null
  content: string
  unread: boolean
  tokenCount: number | null
  status: 'pending' | 'streaming' | 'completed' | 'error'
  errorMessage: string | null
  createdAt: string
  attachmentCount: number
}

export type ApiMailAttachmentSummary = {
  id: number
  replyId: number
  slug: string
  filename: string
  kind: 'text' | 'image'
  mimeType: string
  createdAt: string
}

export type ApiUnreadStats = {
  totalUnreadThreads: number
  totalUnreadReplies: number
}

export async function listThreads(args?: {
  from?: string
  to?: string
  keyword?: string
  unread?: boolean
  tzOffsetMinutes?: number
}): Promise<{ threads: ApiMailThreadSummary[]; unread: ApiUnreadStats }> {
  const params = new URLSearchParams()
  if (args?.from) params.set('from', args.from)
  if (args?.to) params.set('to', args.to)
  if (args?.keyword) params.set('keyword', args.keyword)
  if (args?.unread) params.set('unread', '1')
  if (typeof args?.tzOffsetMinutes === 'number' && Number.isFinite(args.tzOffsetMinutes)) {
    params.set('tzOffsetMinutes', String(Math.trunc(args.tzOffsetMinutes)))
  } else if (typeof window !== 'undefined') {
    params.set('tzOffsetMinutes', String(new Date().getTimezoneOffset()))
  }

  const suffix = params.toString() ? `?${params.toString()}` : ''
  return apiFetch(`/mail/thread${suffix}`)
}

export async function createThread(args: {
  title?: string
  content: string
  model?: string
}): Promise<{ threadUid: string; userReplyId: number; jobId: number }> {
  return apiFetch('/mail/thread', {
    method: 'POST',
    body: JSON.stringify(args),
  })
}

export async function getThread(threadUid: string): Promise<{
  thread: {
    id: number
    threadUid: string
    title: string
    createdAt: string
    updatedAt: string
  }
  replies: ApiMailReply[]
}> {
  return apiFetch(`/mail/thread/${encodeURIComponent(threadUid)}`)
}

export async function updateThreadTitle(args: { threadUid: string; title: string }): Promise<{
  thread: {
    id: number
    threadUid: string
    title: string
    createdAt: string
    updatedAt: string
  } | null
}> {
  return apiFetch(`/mail/thread/${encodeURIComponent(args.threadUid)}`, {
    method: 'PUT',
    body: JSON.stringify({ title: args.title }),
  })
}

export async function createReply(args: {
  threadUid: string
  content: string
  model?: string
}): Promise<{ threadUid: string; userReplyId: number; jobId: number }> {
  return apiFetch(`/mail/thread/${encodeURIComponent(args.threadUid)}/reply`, {
    method: 'POST',
    body: JSON.stringify({
      content: args.content,
      model: args.model,
    }),
  })
}

export async function markThreadRead(threadUid: string): Promise<{
  unreadCount: number
  totalUnreadThreads: number
  totalUnreadReplies: number
}> {
  return apiFetch(`/mail/thread/${encodeURIComponent(threadUid)}/read`, {
    method: 'POST',
  })
}

export async function listThreadAttachments(threadUid: string): Promise<{
  thread: {
    id: number
    threadUid: string
    title: string
    createdAt: string
    updatedAt: string
  }
  attachments: ApiMailAttachmentSummary[]
}> {
  return apiFetch(`/mail/thread/${encodeURIComponent(threadUid)}/attachment`)
}

export async function getReply(args: { threadUid: string; replyId: number }): Promise<{
  thread: {
    id: number
    threadUid: string
    title: string
    createdAt: string
    updatedAt: string
  }
  reply: ApiMailReply
  attachments: ApiMailAttachmentSummary[]
}> {
  return apiFetch(`/mail/thread/${encodeURIComponent(args.threadUid)}/reply/${args.replyId}`)
}

export async function getAttachment(args: {
  threadUid: string
  replyId: number
  attachmentSlug: string
}): Promise<{
  threadUid: string
  replyId: number
  attachment: {
    id: number
    slug: string
    filename: string
    kind: 'text' | 'image'
    mimeType: string
    textContent: string | null
    base64Content: string | null
    createdAt: string
  }
}> {
  return apiFetch(
    `/mail/thread/${encodeURIComponent(args.threadUid)}/reply/${args.replyId}/attachment/${encodeURIComponent(args.attachmentSlug)}`
  )
}

export async function listModelCandidates(): Promise<{ models: string[] }> {
  return apiFetch('/mail/config/model-candidates')
}

export function streamMailThread(args: {
  threadUid: string
  onEvent: (event: MailStreamEvent) => void
  onError: (error: Error) => void
}): () => void {
  const source = new EventSource(`${API_BASE}/mail/thread/${encodeURIComponent(args.threadUid)}/stream`)

  const handleGeneric = (event: MessageEvent) => {
    const parsed = JSON.parse(event.data) as MailStreamEvent
    args.onEvent(parsed)
  }

  source.addEventListener('mail.job.started', handleGeneric as EventListener)
  source.addEventListener('mail.reply.created', handleGeneric as EventListener)
  source.addEventListener('mail.reply.failed', handleGeneric as EventListener)
  source.addEventListener('mail.thread.updated', handleGeneric as EventListener)
  source.addEventListener('mail.unread.changed', handleGeneric as EventListener)

  source.onerror = () => {
    args.onError(new Error('Mail stream connection failed'))
    source.close()
  }

  return () => source.close()
}
