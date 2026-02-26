import { MarkdownPreview } from '@ootc/markdown'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import { FiArrowDown, FiArrowUp, FiSettings } from 'react-icons/fi'
import {
  createReply,
  createThread,
  getAttachment,
  getThread,
  listModelCandidates,
  listThreadAttachments,
  markThreadRead,
  streamMailThread,
  updateThreadTitle,
} from '../lib/api/mail'
import type { ApiMailAttachmentSummary, ApiMailReply } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import { MailAttachmentPreview } from '../components/MailAttachmentPreview'
import type { InlineAttachmentPreview } from '../components/MailAttachmentPreview'
import styles from './MailThreadPage.module.css'

export function MailThreadPage() {
  const params = useParams()
  const navigate = useNavigate()
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const [threadTitle, setThreadTitle] = useState('')
  const [threadUidState, setThreadUidState] = useState<string | null>(null)
  const [replies, setReplies] = useState<ApiMailReply[]>([])
  const [attachmentsByReply, setAttachmentsByReply] = useState<Record<number, ApiMailAttachmentSummary[]>>({})
  const [attachmentPreviewById, setAttachmentPreviewById] = useState<Record<number, InlineAttachmentPreview>>({})
  const [models, setModels] = useState<string[]>([])
  const [modelInput, setModelInput] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [contentInput, setContentInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isWaitingForAssistant, setIsWaitingForAssistant] = useState(false)
  const [showAdvancedOnNewThread, setShowAdvancedOnNewThread] = useState(false)
  const [showAdvancedOnExistingThread, setShowAdvancedOnExistingThread] = useState(false)
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  const [newReplyIds, setNewReplyIds] = useState<Record<number, boolean>>({})
  const [isAtTop, setIsAtTop] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(false)
  const mainColumnRef = useRef<HTMLDivElement | null>(null)
  const messageListRef = useRef<HTMLUListElement | null>(null)
  const composerRef = useRef<HTMLElement | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const autoReadThreadUidRef = useRef<string | null>(null)

  const threadUid = params.threadId ?? null
  const effectiveThreadUid = threadUidState ?? threadUid

  useEffect(() => {
    if (!effectiveThreadUid) {
      document.title = 'New Thread | Mail | yah'
      return
    }
    const shortId = effectiveThreadUid.slice(0, 8)
    document.title = `${threadTitle || `Thread ${shortId}`} | Mail | yah`
  }, [effectiveThreadUid, threadTitle])

  useEffect(() => {
    void listModelCandidates()
      .then((modelsPayload) => {
        setModels(modelsPayload.models)
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
      setIsWaitingForAssistant(false)
      autoReadThreadUidRef.current = null
      return
    }

    void Promise.all([getThread(threadUid), listThreadAttachments(threadUid)])
      .then(([threadPayload, attachmentPayload]) => {
        setThreadUidState(threadPayload.thread.threadUid)
        setThreadTitle(threadPayload.thread.title)
        setTitleInput(threadPayload.thread.title)
        setReplies(threadPayload.replies)
        const grouped: Record<number, ApiMailAttachmentSummary[]> = {}
        for (const attachment of attachmentPayload.attachments) {
          if (!grouped[attachment.replyId]) grouped[attachment.replyId] = []
          grouped[attachment.replyId].push(attachment)
        }
        setAttachmentsByReply(grouped)
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
        const preview: InlineAttachmentPreview =
          detail.kind === 'image'
            ? {
                kind: 'image' as const,
                textSnippet: null,
                imageSrc: detail.base64Content ? `data:${detail.mimeType};base64,${detail.base64Content}` : null,
              }
            : {
                kind: 'text' as const,
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
    if (!effectiveThreadUid) return
    let stopped = false

    const teardown = streamMailThread({
      threadUid: effectiveThreadUid,
      onEvent: (event) => {
        if (stopped) return

        if (event.type === 'mail.reply.failed') {
          setIsWaitingForAssistant(false)
          setError(event.message || 'Reply failed')
          return
        }

        if (event.type !== 'mail.reply.created' && event.type !== 'mail.thread.updated') {
          return
        }

        if (event.type === 'mail.reply.created') {
          setIsWaitingForAssistant(false)
        }

        void Promise.all([getThread(effectiveThreadUid), listThreadAttachments(effectiveThreadUid)])
          .then(([threadPayload, attachmentPayload]) => {
            if (stopped) return
            setThreadTitle(threadPayload.thread.title)
            setTitleInput(threadPayload.thread.title)
            setReplies(threadPayload.replies)
            const grouped: Record<number, ApiMailAttachmentSummary[]> = {}
            for (const attachment of attachmentPayload.attachments) {
              if (!grouped[attachment.replyId]) grouped[attachment.replyId] = []
              grouped[attachment.replyId].push(attachment)
            }
            setAttachmentsByReply(grouped)
            if (event.type === 'mail.reply.created' && threadPayload.replies.some((reply) => reply.id === event.replyId)) {
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
      },
      onError: (streamError) => {
        if (stopped) return
        setError(streamError.message || 'Thread stream connection failed')
      },
    })

    return () => {
      stopped = true
      teardown()
    }
  }, [effectiveThreadUid])

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
              {effectiveThreadUid ? (
                <button
                  type="button"
                  className={styles.advancedToggle}
                  aria-expanded={showAdvancedOnExistingThread}
                  aria-controls="mail-thread-advanced"
                  onClick={() => setShowAdvancedOnExistingThread((current) => !current)}
                >
                  <FiSettings />
                </button>
              ) : null}
            </div>
            <p className={styles.subtitleStats}>
              {replies.filter((reply) => reply.role === 'assistant').length} assistant replies
            </p>
            <div className={styles.toolbar}>
              {effectiveThreadUid ? <Link to={`/mail/thread/${effectiveThreadUid}/attachment`}>Attachments</Link> : null}
            </div>
            {effectiveThreadUid && showAdvancedOnExistingThread ? (
              <div id="mail-thread-advanced" className={styles.headerAdvancedPanel}>
                <p className={styles.advancedHeading}>Advanced settings</p>
                <div className={styles.headerAdvancedRow}>
                  <input
                    className={styles.input}
                    value={titleInput}
                    onChange={(event) => setTitleInput(event.target.value)}
                    placeholder="Thread title"
                  />
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    disabled={isSavingTitle}
                    onClick={() => {
                      if (!effectiveThreadUid) return
                      setIsSavingTitle(true)
                      void updateThreadTitle({ threadUid: effectiveThreadUid, title: titleInput })
                        .then((payload) => {
                          setThreadTitle(payload.thread?.title ?? titleInput)
                          setError(null)
                        })
                        .catch((err: unknown) => {
                          setError(err instanceof Error ? err.message : 'Failed to update thread title')
                        })
                        .finally(() => {
                          setIsSavingTitle(false)
                        })
                    }}
                  >
                    {isSavingTitle ? 'Saving...' : 'Save title'}
                  </button>
                </div>
                <div className={styles.headerAdvancedRow}>
                  <Combobox value={modelInput} onChange={(value) => setModelInput(value ?? '')}>
                    <div className={styles.comboboxShell}>
                      <ComboboxInput
                        className={styles.input}
                        name="model"
                        value={modelInput}
                        onChange={(event) => setModelInput(event.target.value)}
                        placeholder="Model"
                      />
                      {models.length > 0 ? (
                        <ComboboxOptions anchor="bottom start" className={styles.comboboxOptions}>
                          {models.map((model) => (
                            <ComboboxOption key={model} value={model} className={styles.comboboxOption}>
                              {model}
                            </ComboboxOption>
                          ))}
                        </ComboboxOptions>
                      ) : null}
                    </div>
                  </Combobox>
                </div>
              </div>
            ) : null}
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
                      <span className={styles.senderAvatar}>
                        {reply.role === 'assistant' ? (
                          <img src="/logo.png" alt="Assistant" className={styles.senderAvatarImage} />
                        ) : (
                          'U'
                        )}
                      </span>
                      <div className={styles.senderMeta}>
                        <span className={styles.messageRole}>{reply.role === 'assistant' ? 'Assistant' : 'You'}</span>
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
                        <MailAttachmentPreview
                          key={attachment.id}
                          threadUid={effectiveThreadUid ?? ''}
                          replyId={reply.id}
                          attachment={attachment}
                          preview={attachmentPreviewById[attachment.id]}
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className={styles.metaLink}>
                    <Link to={`/mail/thread/${effectiveThreadUid ?? ''}/reply/${reply.id}`}>View full reply</Link>
                  </div>
                </li>
              ))}
              {replies.length === 0 ? <li className={styles.empty}>No messages yet.</li> : null}
              {isWaitingForAssistant ? (
                <li className={`${styles.messageItem} ${styles.messageItemAssistant} ${styles.typingItem}`}>
                  <div className={styles.messageHeader}>
                    <div className={styles.sender}>
                      <span className={styles.senderAvatar}>
                        <img src="/logo.png" alt="Assistant" className={styles.senderAvatarImage} />
                      </span>
                      <div className={styles.senderMeta}>
                        <span className={styles.messageRole}>Assistant</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.typingContent} aria-label="Assistant is typing">
                    <span className={styles.typingDot}>.</span>
                    <span className={styles.typingDot}>.</span>
                    <span className={styles.typingDot}>.</span>
                  </div>
                </li>
              ) : null}
            </ul>
          </section>

          <section className={styles.composer} ref={composerRef}>
            <div className={styles.composerHeader}>
              <h2 className={styles.composerTitle}>{effectiveThreadUid ? 'Reply' : 'Start thread'}</h2>
              {!effectiveThreadUid ? (
                <button
                  type="button"
                  className={styles.advancedToggle}
                  aria-expanded={showAdvancedOnNewThread}
                  aria-controls="mail-new-thread-advanced"
                  onClick={() => setShowAdvancedOnNewThread((current) => !current)}
                >
                  <FiSettings />
                </button>
              ) : null}
            </div>
            {!effectiveThreadUid ? (
              <p className={styles.composerLead}>
                Send your first message. Optional title and model are in advanced settings.
              </p>
            ) : null}
            <form
              className={styles.formGrid}
              onSubmit={(event) => {
                event.preventDefault()
                const form = new FormData(event.currentTarget)
                const content = contentInput.trim()
                const title = String(form.get('title') ?? '').trim()
                const model = modelInput.trim()
                const wasNewThread = !effectiveThreadUid

                if (!content) {
                  setError('content is required')
                  return
                }

                const run = effectiveThreadUid
                  ? createReply({
                      threadUid: effectiveThreadUid,
                      content,
                      model: model || undefined,
                    })
                  : createThread({
                      title: title || undefined,
                      content,
                      model: model || undefined,
                    })

                void run
                  .then((payload) => {
                    setThreadUidState(payload.threadUid)
                    if (wasNewThread) {
                      navigate(`/mail/thread/${payload.threadUid}`)
                    }
                    setContentInput('')
                    window.requestAnimationFrame(() => {
                      composerTextareaRef.current?.focus()
                    })
                    setIsWaitingForAssistant(true)
                    return Promise.all([getThread(payload.threadUid), listThreadAttachments(payload.threadUid)]).then(
                      ([threadPayload, attachmentPayload]) => ({
                        threadPayload,
                        attachmentPayload,
                        userReplyId: payload.userReplyId,
                      })
                    )
                  })
                  .then(({ threadPayload, attachmentPayload, userReplyId }) => {
                    setThreadTitle(threadPayload.thread.title)
                    setReplies(threadPayload.replies)
                    if (
                      threadPayload.replies.some((reply) => reply.role === 'assistant' && reply.id > userReplyId)
                    ) {
                      setIsWaitingForAssistant(false)
                    }
                    const grouped: Record<number, ApiMailAttachmentSummary[]> = {}
                    for (const attachment of attachmentPayload.attachments) {
                      if (!grouped[attachment.replyId]) grouped[attachment.replyId] = []
                      grouped[attachment.replyId].push(attachment)
                    }
                    setAttachmentsByReply(grouped)
                    setError(null)
                  })
                  .catch((err: unknown) => {
                    setIsWaitingForAssistant(false)
                    setError(err instanceof Error ? err.message : 'Failed to submit message')
                  })
              }}
            >
              {!effectiveThreadUid ? (
                showAdvancedOnNewThread ? (
                  <div id="mail-new-thread-advanced" className={styles.advancedPanel}>
                    <p className={styles.advancedHeading}>Advanced settings</p>
                    <input className={styles.input} name="title" placeholder="Thread title (optional)" />
                    <div className={styles.row}>
                      <Combobox value={modelInput} onChange={(value) => setModelInput(value ?? '')}>
                        <div className={styles.comboboxShell}>
                          <ComboboxInput
                            className={styles.input}
                            name="model"
                            value={modelInput}
                            onChange={(event) => setModelInput(event.target.value)}
                            placeholder="Model"
                          />
                          {models.length > 0 ? (
                            <ComboboxOptions anchor="bottom start" className={styles.comboboxOptions}>
                              {models.map((model) => (
                                <ComboboxOption key={model} value={model} className={styles.comboboxOption}>
                                  {model}
                                </ComboboxOption>
                              ))}
                            </ComboboxOptions>
                          ) : null}
                        </div>
                      </Combobox>
                    </div>
                  </div>
                ) : null
              ) : null}
              <textarea
                className={styles.textarea}
                name="content"
                rows={8}
                placeholder="Write mail..."
                value={contentInput}
                onChange={(event) => setContentInput(event.target.value)}
                ref={composerTextareaRef}
              />
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
