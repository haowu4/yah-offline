import { MarkdownPreview } from '@ootc/markdown'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getReply } from '../lib/api/mail'
import type { ApiMailAttachmentSummary, ApiMailReply } from '../lib/api/mail'
import styles from './MailCommon.module.css'

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
    <div className={styles.container}>
      <h1 className={styles.title}>Reply</h1>
      <div className={styles.actions}>
        <Link to={`/mail/thread/${threadUid}`}>Back to thread</Link>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {reply ? (
        <div className={styles.contentBox}>
          <MarkdownPreview content={reply.content} />
        </div>
      ) : (
        <p className={styles.statusLine}>Loading...</p>
      )}

      <ul className={styles.list}>
        {attachments.map((attachment) => (
          <li key={attachment.id} className={styles.item}>
            <p className={styles.itemTitle}>
              <Link to={`/mail/thread/${threadUid}/reply/${replyId}/attachment/${attachment.slug}`}>
                {attachment.filename}
              </Link>
              <span className={styles.badge}>{attachment.kind}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
