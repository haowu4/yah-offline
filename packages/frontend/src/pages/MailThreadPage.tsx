import { MarkdownPreview } from '@ootc/markdown'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { FiArrowDown, FiArrowUp, FiPaperclip } from 'react-icons/fi'
import {
  createReply,
  createThread,
  getAttachment,
  getContactIconUrl,
  getComposerConfig,
  getThread,
  listContacts,
  listModelCandidates,
  listThreadAttachments,
  markThreadRead,
} from '../lib/api/mail'
import type { ApiMailAttachmentSummary, ApiMailContact, ApiMailReply } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import { useMailCtx } from '../ctx/MailCtx'
import styles from './MailThreadPage.module.css'

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function colorTone(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return 'rgba(120, 120, 120, 0.14)'
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

function resolveContactSlug(input: string, contacts: ApiMailContact[]): string | undefined | null {
  const normalized = input.trim()
  if (!normalized) return undefined

  const slugMatch = contacts.find((contact) => contact.slug === normalized)
  if (slugMatch) return slugMatch.slug

  const exactNameMatches = contacts.filter((contact) => contact.name.toLowerCase() === normalized.toLowerCase())
  if (exactNameMatches.length === 1) return exactNameMatches[0].slug

  return null
}

export function MailThreadPage() {
  const params = useParams()
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const mail = useMailCtx()
  const [threadTitle, setThreadTitle] = useState('')
  const [threadUidState, setThreadUidState] = useState<string | null>(null)
  const [replies, setReplies] = useState<ApiMailReply[]>([])
  const [attachmentsByReply, setAttachmentsByReply] = useState<Record<number, ApiMailAttachmentSummary[]>>({})
  const [attachmentPreviewById, setAttachmentPreviewById] = useState<
    Record<number, { kind: 'text' | 'image'; mimeType: string; textSnippet: string | null; imageSrc: string | null }>
  >({})
  const [contacts, setContacts] = useState<ApiMailContact[]>([])
  const [models, setModels] = useState<string[]>([])
  const [contactInput, setContactInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [iconLoadFailures, setIconLoadFailures] = useState<Record<number, boolean>>({})
  const [newReplyIds, setNewReplyIds] = useState<Record<number, boolean>>({})
  const [isAtTop, setIsAtTop] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(false)
  const mainColumnRef = useRef<HTMLDivElement | null>(null)
  const messageListRef = useRef<HTMLUListElement | null>(null)
  const composerRef = useRef<HTMLElement | null>(null)
  const autoReadThreadUidRef = useRef<string | null>(null)

  const threadUid = params.threadId ?? null
  const effectiveThreadUid = threadUidState ?? threadUid

  useEffect(() => {
    void Promise.all([listContacts(), listModelCandidates(), getComposerConfig()])
      .then(([contactsPayload, modelsPayload, composerPayload]) => {
        setContacts(contactsPayload.contacts)
        setModels(modelsPayload.models)
        if (composerPayload.defaultContact && !contactInput.trim()) {
          const matched = contactsPayload.contacts.find(
            (contact) => contact.slug === composerPayload.defaultContact
          )
          setContactInput(matched ? matched.name : composerPayload.defaultContact)
        }
      })
      .catch(() => {
        // keep composer usable even if config fetch fails
      })
  }, [])

  useEffect(() => {
    if (!threadUid) {
      setThreadUidState(null)
      setThreadTitle('')
      setReplies([])
      setAttachmentsByReply({})
      setAttachmentPreviewById({})
      setNewReplyIds({})
      autoReadThreadUidRef.current = null
      return
    }

    void Promise.all([getThread(threadUid), listThreadAttachments(threadUid)])
      .then(([threadPayload, attachmentPayload]) => {
        setThreadUidState(threadPayload.thread.threadUid)
        setThreadTitle(threadPayload.thread.title)
        setReplies(threadPayload.replies)
        const grouped: Record<number, ApiMailAttachmentSummary[]> = {}
        for (const attachment of attachmentPayload.attachments) {
          if (!grouped[attachment.replyId]) grouped[attachment.replyId] = []
          grouped[attachment.replyId].push(attachment)
        }
        setAttachmentsByReply(grouped)
        setIconLoadFailures({})
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load thread')
      })
  }, [threadUid])

  useEffect(() => {
    if (!effectiveThreadUid) return
    const attachments = Object.values(attachmentsByReply).flat()
    const missing = attachments.filter((item) => !attachmentPreviewById[item.id])
    if (missing.length === 0) return

    let cancelled = false
    void Promise.all(
      missing.map(async (item) => {
        const payload = await getAttachment({
          threadUid: effectiveThreadUid,
          replyId: item.replyId,
          attachmentSlug: item.slug,
        })
        const detail = payload.attachment
        const preview =
          detail.kind === 'image'
            ? {
                kind: 'image' as const,
                mimeType: detail.mimeType,
                textSnippet: null,
                imageSrc: detail.base64Content ? `data:${detail.mimeType};base64,${detail.base64Content}` : null,
              }
            : {
                kind: 'text' as const,
                mimeType: detail.mimeType,
                textSnippet: (detail.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 180),
                imageSrc: null,
              }

        return { id: item.id, preview }
      })
    )
      .then((items) => {
        if (cancelled) return
        setAttachmentPreviewById((current) => {
          const next = { ...current }
          for (const item of items) {
            next[item.id] = item.preview
          }
          return next
        })
      })
      .catch(() => {
        // ignore preview failures; links still work
      })

    return () => {
      cancelled = true
    }
  }, [attachmentPreviewById, attachmentsByReply, effectiveThreadUid])

  useEffect(() => {
    if (!effectiveThreadUid) {
      setBreadcrumbs([
        { label: 'Mail', to: '/mail' },
        { label: 'New Thread' },
      ])
      return
    }

    setBreadcrumbs([
      { label: 'Mail', to: '/mail' },
      { label: threadTitle || `Thread ${effectiveThreadUid.slice(0, 8)}` },
    ])
  }, [effectiveThreadUid, setBreadcrumbs, threadTitle])

  useEffect(() => {
    if (!effectiveThreadUid) return
    if (autoReadThreadUidRef.current === effectiveThreadUid) return
    if (!replies.some((reply) => reply.unread)) return

    autoReadThreadUidRef.current = effectiveThreadUid
    void markThreadRead(effectiveThreadUid)
      .then(() => {
        setReplies((current) => current.map((reply) => ({ ...reply, unread: false })))
      })
      .catch(() => {
        autoReadThreadUidRef.current = null
      })
  }, [effectiveThreadUid, replies])

  useEffect(() => {
    const event = mail.lastReplyEvent
    if (!event || !effectiveThreadUid) return
    if (event.threadUid !== effectiveThreadUid) return

    void Promise.all([getThread(effectiveThreadUid), listThreadAttachments(effectiveThreadUid)])
      .then(([threadPayload, attachmentPayload]) => {
        setThreadTitle(threadPayload.thread.title)
        setReplies(threadPayload.replies)
        const grouped: Record<number, ApiMailAttachmentSummary[]> = {}
        for (const attachment of attachmentPayload.attachments) {
          if (!grouped[attachment.replyId]) grouped[attachment.replyId] = []
          grouped[attachment.replyId].push(attachment)
        }
        setAttachmentsByReply(grouped)
        if (threadPayload.replies.some((reply) => reply.id === event.replyId)) {
          setNewReplyIds((current) => ({ ...current, [event.replyId]: true }))
          window.setTimeout(() => {
            setNewReplyIds((current) => {
              if (!current[event.replyId]) return current
              const next = { ...current }
              delete next[event.replyId]
              return next
            })
          }, 10000)
        }
      })
      .catch(() => {
        // keep current thread view if refresh fails
      })
  }, [effectiveThreadUid, mail.lastReplyEvent])

  useEffect(() => {
    const node = mainColumnRef.current
    if (!node) return

    const updateScrollEdges = () => {
      const maxScrollTop = Math.max(0, node.scrollHeight - node.clientHeight)
      setIsAtTop(node.scrollTop <= 2)
      setIsAtBottom(maxScrollTop - node.scrollTop <= 2)
    }

    updateScrollEdges()
    node.addEventListener('scroll', updateScrollEdges, { passive: true })
    window.addEventListener('resize', updateScrollEdges)
    const observer = new ResizeObserver(updateScrollEdges)
    observer.observe(node)

    return () => {
      node.removeEventListener('scroll', updateScrollEdges)
      window.removeEventListener('resize', updateScrollEdges)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const node = mainColumnRef.current
    if (!node) return
    const maxScrollTop = Math.max(0, node.scrollHeight - node.clientHeight)
    setIsAtTop(node.scrollTop <= 2)
    setIsAtBottom(maxScrollTop - node.scrollTop <= 2)
  }, [replies, threadTitle, effectiveThreadUid])

  return (
    <div className={styles.page}>
      <div className={styles.contentWrap}>
        <div className={styles.mainColumnWrap}>
          <div className={styles.mainColumn} ref={mainColumnRef}>
          <header className={styles.header}>
            <div className={styles.subjectRow}>
              <h1 className={styles.subject}>{threadTitle || 'New thread'}</h1>
              <span className={styles.threadChip}>
                {replies.filter((reply) => reply.role === 'assistant').length} assistant replies
              </span>
            </div>
            <div className={styles.toolbar}>
              {effectiveThreadUid ? <Link to={`/mail/thread/${effectiveThreadUid}/attachment`}>Attachments</Link> : null}
            </div>
          </header>

          <section className={styles.threadBody}>
            <ul className={styles.messageList} ref={messageListRef}>
              {replies.map((reply) => (
                <li
                  key={reply.id}
                  className={`${styles.messageItem} ${reply.role === 'assistant' ? styles.messageItemAssistant : styles.messageItemUser} ${newReplyIds[reply.id] ? styles.messageItemNew : ''}`}
                >
                  <div className={styles.messageHeader}>
                    <div className={styles.sender}>
                      <span
                        className={styles.senderAvatar}
                        style={
                          reply.role === 'assistant' && reply.contact?.color
                            ? {
                                borderColor: colorTone(reply.contact.color, 0.5),
                                background: colorTone(reply.contact.color, 0.18),
                              }
                            : undefined
                        }
                      >
                        {reply.role === 'assistant' &&
                        reply.contact?.iconLocation &&
                        !iconLoadFailures[reply.id] ? (
                          <img
                            className={styles.senderAvatarImage}
                            src={getContactIconUrl(reply.contact.slug, reply.contact.updatedAt)}
                            alt={reply.contact.name}
                            onError={() => {
                              setIconLoadFailures((current) => ({ ...current, [reply.id]: true }))
                            }}
                          />
                        ) : reply.role === 'assistant' ? (
                          'A'
                        ) : (
                          'U'
                        )}
                      </span>
                      <div className={styles.senderMeta}>
                        <span className={styles.messageRole}>{reply.role === 'assistant' ? 'Assistant' : 'You'}</span>
                        {reply.contact ? (
                          <span className={styles.senderSub}>
                            <span
                              className={styles.contactDot}
                              style={
                                reply.role === 'assistant' && reply.contact?.color
                                  ? { background: reply.contact.color }
                                  : undefined
                              }
                            />
                            {reply.contact.name}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.headerRight}>
                      {newReplyIds[reply.id] ? <span className={`${styles.badge} ${styles.newBadge}`}>New</span> : null}
                      {reply.unread ? <span className={`${styles.badge} ${styles.unread}`}>Unread</span> : null}
                      <span className={styles.time}>{new Date(reply.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className={styles.messageContent}>
                    <MarkdownPreview content={reply.content} />
                  </div>
                  {(attachmentsByReply[reply.id]?.length ?? 0) > 0 ? (
                    <div className={styles.attachmentRow}>
                      {(attachmentsByReply[reply.id] || []).map((attachment) => (
                        <div key={attachment.id} className={styles.attachmentCard}>
                          <Link
                            className={styles.attachmentChip}
                            to={`/mail/thread/${effectiveThreadUid ?? ''}/reply/${reply.id}/attachment/${attachment.slug}`}
                          >
                            <FiPaperclip />
                            <span>{attachment.filename}</span>
                          </Link>
                          {attachmentPreviewById[attachment.id]?.kind === 'image' &&
                          attachmentPreviewById[attachment.id].imageSrc ? (
                            <Link
                              className={styles.attachmentPreviewLink}
                              to={`/mail/thread/${effectiveThreadUid ?? ''}/reply/${reply.id}/attachment/${attachment.slug}`}
                            >
                              <img
                                className={styles.attachmentImagePreview}
                                src={attachmentPreviewById[attachment.id].imageSrc ?? ''}
                                alt={attachment.filename}
                              />
                            </Link>
                          ) : null}
                          {attachmentPreviewById[attachment.id]?.kind === 'text' ? (
                            <Link
                              className={styles.attachmentTextPreview}
                              to={`/mail/thread/${effectiveThreadUid ?? ''}/reply/${reply.id}/attachment/${attachment.slug}`}
                            >
                              {attachmentPreviewById[attachment.id].textSnippet || '(empty text file)'}
                            </Link>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className={styles.metaLink}>
                    <Link to={`/mail/thread/${effectiveThreadUid ?? ''}/reply/${reply.id}`}>View full reply</Link>
                  </div>
                </li>
              ))}
              {replies.length === 0 ? <li className={styles.empty}>No messages yet.</li> : null}
            </ul>
          </section>

          <section className={styles.composer} ref={composerRef}>
            <h2 className={styles.composerTitle}>Reply</h2>
            <form
              className={styles.formGrid}
              onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const content = String(form.get('content') ?? '').trim()
            const title = String(form.get('title') ?? '').trim()
            const contactSlug = resolveContactSlug(contactInput, contacts)
            const model = String(form.get('model') ?? '').trim()

            if (!content) {
              setError('content is required')
              return
            }

            if (contactSlug === null) {
              setError('contact not found')
              return
            }

            const run = effectiveThreadUid
              ? createReply({
                  threadUid: effectiveThreadUid,
                  content,
                  contactSlug: contactSlug || undefined,
                  model: model || undefined,
                })
              : createThread({
                  title: title || undefined,
                  content,
                  contactSlug: contactSlug || undefined,
                  model: model || undefined,
                })

            void run
              .then((payload) => {
                setThreadUidState(payload.threadUid)
                return getThread(payload.threadUid)
              })
              .then((payload) => {
                setThreadTitle(payload.thread.title)
                setReplies(payload.replies)
                return listThreadAttachments(payload.thread.threadUid)
              })
              .then((attachmentPayload) => {
                const grouped: Record<number, ApiMailAttachmentSummary[]> = {}
                for (const attachment of attachmentPayload.attachments) {
                  if (!grouped[attachment.replyId]) grouped[attachment.replyId] = []
                  grouped[attachment.replyId].push(attachment)
                }
                setAttachmentsByReply(grouped)
                setError(null)
              })
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Failed to submit message')
              })
              }}
            >
              {!effectiveThreadUid ? (
                <input className={styles.input} name="title" placeholder="Thread title (optional)" />
              ) : null}
              <div className={styles.row}>
                <>
                  <input
                    className={styles.input}
                    name="contact"
                    list="mail-contacts"
                    placeholder="Contact (name or slug)"
                    value={contactInput}
                    onChange={(event) => setContactInput(event.target.value)}
                  />
                  <datalist id="mail-contacts">
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.name} label={contact.slug} />
                    ))}
                  </datalist>
                </>
                <>
                  <input className={styles.input} name="model" list="mail-models" placeholder="Model" />
                  <datalist id="mail-models">
                    {models.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </>
              </div>
              <textarea className={styles.textarea} name="content" rows={8} placeholder="Write mail..." />
              <div className={styles.actions}>
                <button className={styles.button} type="submit">
                  Send
                </button>
                {effectiveThreadUid ? (
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    onClick={() => {
                      void markThreadRead(effectiveThreadUid)
                        .then(() => Promise.all([getThread(effectiveThreadUid), listThreadAttachments(effectiveThreadUid)]))
                        .then(([threadPayload, attachmentPayload]) => {
                          setReplies(threadPayload.replies)
                          const grouped: Record<number, ApiMailAttachmentSummary[]> = {}
                          for (const attachment of attachmentPayload.attachments) {
                            if (!grouped[attachment.replyId]) grouped[attachment.replyId] = []
                            grouped[attachment.replyId].push(attachment)
                          }
                          setAttachmentsByReply(grouped)
                        })
                        .catch((err: unknown) => {
                          setError(err instanceof Error ? err.message : 'Failed to mark as read')
                        })
                    }}
                  >
                    Mark thread read
                  </button>
                ) : null}
              </div>
              {error ? <p className={styles.error}>{error}</p> : null}
            </form>
          </section>
          </div>
          {!isAtTop ? <div className={styles.scrollFadeTop} aria-hidden /> : null}
          {!isAtBottom ? <div className={styles.scrollFadeBottom} aria-hidden /> : null}
        </div>

        <aside className={styles.sideColumn} aria-label="Thread navigation controls">
          <div className={styles.scrollDock}>
            <button
              type="button"
              className={styles.scrollButton}
              aria-label="Scroll to top"
              title="Scroll to top"
              onClick={() => {
                const container = mainColumnRef.current
                if (!container) return
                container.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              <FiArrowUp />
            </button>
            <button
              type="button"
              className={styles.scrollButton}
              aria-label="Scroll to bottom"
              title="Scroll to bottom"
              onClick={() => {
                const container = mainColumnRef.current
                const composer = composerRef.current
                if (!container || !composer) return
                const delta = composer.getBoundingClientRect().top - container.getBoundingClientRect().top
                container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' })
              }}
            >
              <FiArrowDown />
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
