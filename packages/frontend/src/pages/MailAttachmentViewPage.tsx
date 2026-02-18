import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getAttachment } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import styles from './MailCommon.module.css'

type AttachmentPayload = {
  id: number
  slug: string
  filename: string
  kind: 'text' | 'image'
  mimeType: string
  textContent: string | null
  base64Content: string | null
  createdAt: string
}

export function MailAttachmentViewPage() {
  const params = useParams()
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const threadUid = params.threadId ?? ''
  const replyId = Number.parseInt(params.replyId ?? '', 10)
  const attachmentSlug = params.attachmentSlug ?? ''

  const [attachment, setAttachment] = useState<AttachmentPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Mail', to: '/mail' },
      { label: `Thread ${threadUid.slice(0, 8)}`, to: `/mail/thread/${threadUid}` },
      { label: `Reply #${Number.isInteger(replyId) ? replyId : ''}`, to: `/mail/thread/${threadUid}/reply/${replyId}` },
      { label: attachment?.filename || attachmentSlug || 'Attachment' },
    ])
  }, [attachment?.filename, attachmentSlug, replyId, setBreadcrumbs, threadUid])

  useEffect(() => {
    if (!threadUid || !Number.isInteger(replyId) || !attachmentSlug) return

    void getAttachment({ threadUid, replyId, attachmentSlug })
      .then((payload) => {
        setAttachment(payload.attachment)
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load attachment')
      })
  }, [attachmentSlug, replyId, threadUid])

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Attachment</h1>
      <div className={styles.actions}>
        <Link to={`/mail/thread/${threadUid}/reply/${replyId}`}>Back to reply</Link>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {!attachment ? <p className={styles.statusLine}>Loading...</p> : null}
      {attachment?.kind === 'text' ? (
        <div className={styles.contentBox}>
          <pre className={styles.pre}>{attachment.textContent ?? ''}</pre>
        </div>
      ) : null}
      {attachment?.kind === 'image' && attachment.base64Content ? (
        <img
          className={styles.image}
          alt={attachment.filename}
          src={`data:${attachment.mimeType};base64,${attachment.base64Content}`}
        />
      ) : null}
    </div>
  )
}
