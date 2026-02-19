import { MarkdownPreview } from '@ootc/markdown'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  createReply,
  createThread,
  getContactIconUrl,
  getComposerConfig,
  getThread,
  listContacts,
  listModelCandidates,
  markThreadRead,
} from '../lib/api/mail'
import type { ApiMailContact, ApiMailReply } from '../lib/api/mail'
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
  const [contacts, setContacts] = useState<ApiMailContact[]>([])
  const [models, setModels] = useState<string[]>([])
  const [contactInput, setContactInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [iconLoadFailures, setIconLoadFailures] = useState<Record<number, boolean>>({})
  const [newReplyIds, setNewReplyIds] = useState<Record<number, boolean>>({})
  const autoReadThreadUidRef = useRef<string | null>(null)

  const threadUid = params.threadId ?? null

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
      setNewReplyIds({})
      autoReadThreadUidRef.current = null
      return
    }

    void getThread(threadUid)
      .then((payload) => {
        setThreadUidState(payload.thread.threadUid)
        setThreadTitle(payload.thread.title)
        setReplies(payload.replies)
        setIconLoadFailures({})
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load thread')
      })
  }, [threadUid])

  const effectiveThreadUid = threadUidState ?? threadUid

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

    void getThread(effectiveThreadUid)
      .then((payload) => {
        setThreadTitle(payload.thread.title)
        setReplies(payload.replies)
        if (payload.replies.some((reply) => reply.id === event.replyId)) {
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

  return (
    <div className={styles.page}>
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
        <ul className={styles.messageList}>
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
              <div className={styles.metaLink}>
                <Link to={`/mail/thread/${effectiveThreadUid ?? ''}/reply/${reply.id}`}>View full reply</Link>
              </div>
            </li>
          ))}
          {replies.length === 0 ? <li className={styles.empty}>No messages yet.</li> : null}
        </ul>
      </section>

      <section className={styles.composer}>
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
                    .then(() => getThread(effectiveThreadUid))
                    .then((payload) => {
                      setReplies(payload.replies)
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
  )
}
