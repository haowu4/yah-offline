import { MarkdownPreview } from '@ootc/markdown'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getReply } from '../lib/api/mail'
import type { ApiMailAttachmentSummary, ApiMailReply } from '../lib/api/mail'

export function MailReplyPage() {
  const params = useParams()
  const threadUid = params.threadId ?? ''
  const replyId = Number.parseInt(params.replyId ?? '', 10)
  const [reply, setReply] = useState<ApiMailReply | null>(null)
  const [attachments, setAttachments] = useState<ApiMailAttachmentSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!threadUid || !Number.isInteger(replyId)) return

    void getReply({ threadUid, replyId })
      .then((payload) => {
        setReply(payload.reply)
        setAttachments(payload.attachments)
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load reply')
      })
  }, [replyId, threadUid])

  return (
    <div>
      <h1>Reply</h1>
      {error ? <p>{error}</p> : null}
      {reply ? <MarkdownPreview content={reply.content} /> : <p>Loading...</p>}

      <ul>
        {attachments.map((attachment) => (
          <li key={attachment.id}>
            <Link to={`/mail/thread/${threadUid}/reply/${replyId}/attachment/${attachment.slug}`}>
              {attachment.filename}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
