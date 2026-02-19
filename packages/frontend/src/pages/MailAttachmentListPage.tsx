import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { listThreadAttachments } from '../lib/api/mail'
import type { ApiMailAttachmentSummary } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import styles from './MailCommon.module.css'

export function MailAttachmentListPage() {
  const params = useParams()
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const threadUid = params.threadId ?? ''
  const [attachments, setAttachments] = useState<ApiMailAttachmentSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Thread Attachments | Mail | yah'
  }, [])

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Mail', to: '/mail' },
      { label: `Thread ${threadUid.slice(0, 8)}`, to: `/mail/thread/${threadUid}` },
      { label: 'Attachments' },
    ])
  }, [setBreadcrumbs, threadUid])

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
    <div className={styles.container}>
      <h1 className={styles.title}>Thread Attachments</h1>
      <div className={styles.actions}>
        <Link to={`/mail/thread/${threadUid}`}>Back to thread</Link>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {!error && attachments.length === 0 ? (
        <p className={styles.emptyState}>No attachments found for this thread.</p>
      ) : null}
      <ul className={styles.list}>
        {attachments.map((attachment) => (
          <li key={attachment.id} className={styles.item}>
            <p className={styles.itemTitle}>
              <Link to={`/mail/thread/${threadUid}/reply/${attachment.replyId}/attachment/${attachment.slug}`}>
                {attachment.filename}
              </Link>
              <span className={styles.badge}>{attachment.kind}</span>
            </p>
            <p className={styles.meta}>reply #{attachment.replyId}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
