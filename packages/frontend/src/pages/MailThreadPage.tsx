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
    <div>
      <h1>{effectiveThreadUid ? `Thread ${effectiveThreadUid.slice(0, 8)}` : 'New Thread'}</h1>
      <p>Title: {threadTitle || '(untitled)'}</p>
      {effectiveThreadUid ? (
        <p>
          <Link to={`/mail/thread/${effectiveThreadUid}/attachment`}>View attachments</Link>
        </p>
      ) : null}
      {error ? <p>{error}</p> : null}

      <ul>
        {replies.map((reply) => (
          <li key={reply.id}>
            <p>
              <strong>{reply.role}</strong> {reply.contact ? `(${reply.contact.name})` : ''} | unread:{' '}
              {reply.unread ? 'yes' : 'no'}
            </p>
            <MarkdownPreview content={reply.content} />
            <p>
              <Link to={`/mail/thread/${effectiveThreadUid ?? ''}/reply/${reply.id}`}>Open reply</Link>
            </p>
          </li>
        ))}
      </ul>

      <form
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
          <p>
            <input name="title" placeholder="Thread title (optional)" />
          </p>
        ) : null}
        <p>
          <select name="contactSlug" defaultValue="">
            <option value="">No contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.slug}>
                {contact.name}
              </option>
            ))}
          </select>
        </p>
        <p>
          <input name="model" list="mail-models" placeholder="Model" />
          <datalist id="mail-models">
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </p>
        <p>
          <textarea name="content" rows={8} placeholder="Write mail..." />
        </p>
        <button type="submit">Send</button>
      </form>

      {effectiveThreadUid ? (
        <button
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
  )
}
