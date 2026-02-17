import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { listThreadAttachments } from '../lib/api/mail'
import type { ApiMailAttachmentSummary } from '../lib/api/mail'

export function MailAttachmentListPage() {
  const params = useParams()
  const threadUid = params.threadId ?? ''
  const [attachments, setAttachments] = useState<ApiMailAttachmentSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!threadUid) return
    void listThreadAttachments(threadUid)
      .then((payload) => {
        setAttachments(payload.attachments)
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load attachments')
      })
  }, [threadUid])

  return (
    <div>
      <h1>Thread Attachments</h1>
      {error ? <p>{error}</p> : null}
      <ul>
        {attachments.map((attachment) => (
          <li key={attachment.id}>
            <Link
              to={`/mail/thread/${threadUid}/reply/${attachment.replyId}/attachment/${attachment.slug}`}
            >
              {attachment.filename}
            </Link>{' '}
            ({attachment.kind})
          </li>
        ))}
      </ul>
    </div>
  )
}
