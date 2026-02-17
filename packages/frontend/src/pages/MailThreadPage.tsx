import { MarkdownPreview } from '@ootc/markdown'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  createReply,
  createThread,
  getThread,
  listContacts,
  listModelCandidates,
  markThreadRead,
} from '../lib/api/mail'
import type { ApiMailContact, ApiMailReply } from '../lib/api/mail'
import styles from './MailCommon.module.css'

export function MailThreadPage() {
  const params = useParams()
  const [threadTitle, setThreadTitle] = useState('')
  const [threadUidState, setThreadUidState] = useState<string | null>(null)
  const [replies, setReplies] = useState<ApiMailReply[]>([])
  const [contacts, setContacts] = useState<ApiMailContact[]>([])
  const [models, setModels] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const threadUid = params.threadId ?? null

  useEffect(() => {
    void listContacts().then((payload) => setContacts(payload.contacts))
    void listModelCandidates().then((payload) => setModels(payload.models))
  }, [])

  useEffect(() => {
    if (!threadUid) {
      setThreadUidState(null)
      setThreadTitle('')
      setReplies([])
      return
    }

    void getThread(threadUid)
      .then((payload) => {
        setThreadUidState(payload.thread.threadUid)
        setThreadTitle(payload.thread.title)
        setReplies(payload.replies)
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load thread')
      })
  }, [threadUid])

  const effectiveThreadUid = threadUidState ?? threadUid

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{effectiveThreadUid ? `Thread ${effectiveThreadUid.slice(0, 8)}` : 'New Thread'}</h1>
      <p className={styles.meta}>Title: {threadTitle || '(untitled)'}</p>
      <div className={styles.actions}>
        <Link to="/mail">Back to threads</Link>
        {effectiveThreadUid ? (
          <Link to={`/mail/thread/${effectiveThreadUid}/attachment`}>View attachments</Link>
        ) : null}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      <ul className={styles.list}>
        {replies.map((reply) => (
          <li key={reply.id} className={styles.item}>
            <p className={styles.itemTitle}>
              <span>{reply.role}</span>
              {reply.contact ? <span className={styles.badge}>{reply.contact.name}</span> : null}
              {reply.unread ? <span className={styles.badge}>unread</span> : null}
            </p>
            <div className={styles.contentBox}>
              <MarkdownPreview content={reply.content} />
            </div>
            <p className={styles.meta}>
              <Link to={`/mail/thread/${effectiveThreadUid ?? ''}/reply/${reply.id}`}>Open reply</Link>
            </p>
          </li>
        ))}
      </ul>

      <form
        className={styles.formGrid}
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const content = String(form.get('content') ?? '').trim()
          const title = String(form.get('title') ?? '').trim()
          const contactSlug = String(form.get('contactSlug') ?? '').trim()
          const model = String(form.get('model') ?? '').trim()

          if (!content) {
            setError('content is required')
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
          <select className={styles.select} name="contactSlug" defaultValue="">
            <option value="">No contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.slug}>
                {contact.name}
              </option>
            ))}
          </select>
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
          <button className={styles.button} type="submit">Send</button>
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
      </form>
    </div>
  )
}
