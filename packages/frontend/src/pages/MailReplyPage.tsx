import { MarkdownPreview } from '@ootc/markdown'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getAttachment, getReply } from '../lib/api/mail'
import type { ApiMailAttachmentSummary, ApiMailReply } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import { MailAttachmentPreview } from '../components/MailAttachmentPreview'
import type { InlineAttachmentPreview } from '../components/MailAttachmentPreview'
import styles from './MailReplyPage.module.css'

export function MailReplyPage() {
  const params = useParams()
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const threadUid = params.threadId ?? ''
  const replyId = Number.parseInt(params.replyId ?? '', 10)
  const [reply, setReply] = useState<ApiMailReply | null>(null)
  const [attachments, setAttachments] = useState<ApiMailAttachmentSummary[]>([])
  const [attachmentPreviewById, setAttachmentPreviewById] = useState<Record<number, InlineAttachmentPreview>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Mail', to: '/mail' },
      { label: `Thread ${threadUid.slice(0, 8)}`, to: `/mail/thread/${threadUid}` },
      { label: `Reply ${Number.isInteger(replyId) ? `#${replyId}` : ''}`.trim() },
    ])
  }, [replyId, setBreadcrumbs, threadUid])

  useEffect(() => {
    if (!threadUid || !Number.isInteger(replyId)) return

    void getReply({ threadUid, replyId })
      .then((payload) => {
        setReply(payload.reply)
        setAttachments(payload.attachments)
        setAttachmentPreviewById({})
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load reply')
      })
  }, [replyId, threadUid])

  useEffect(() => {
    if (!threadUid || !Number.isInteger(replyId)) return
    const missing = attachments.filter((item) => !attachmentPreviewById[item.id])
    if (missing.length === 0) return

    let cancelled = false
    void Promise.all(
      missing.map(async (item) => {
        const payload = await getAttachment({
          threadUid,
          replyId,
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
        // ignore preview load errors
      })

    return () => {
      cancelled = true
    }
  }, [attachmentPreviewById, attachments, replyId, threadUid])

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Reply #{Number.isInteger(replyId) ? replyId : ''}</h1>
          <p className={styles.subtitle}>Thread {threadUid.slice(0, 8)}</p>
        </div>
        <div className={styles.actions}>
          <Link to={`/mail/thread/${threadUid}`}>Back to thread</Link>
        </div>
      </header>
      {error ? <p className={styles.error}>{error}</p> : null}
      {reply ? (
        <>
          <section className={styles.metaCard}>
            <span className={styles.metaItem}>
              <strong>Role:</strong> {reply.role}
            </span>
            <span className={styles.metaItem}>
              <strong>Contact:</strong> {reply.contact?.name || '-'}
            </span>
            <span className={styles.metaItem}>
              <strong>Model:</strong> {reply.model || '-'}
            </span>
            <span className={styles.metaItem}>
              <strong>Created:</strong> {new Date(reply.createdAt).toLocaleString()}
            </span>
          </section>

          <section className={styles.contentCard}>
            <h2 className={styles.sectionTitle}>Content</h2>
            <div className={styles.markdown}>
              <MarkdownPreview content={reply.content} />
            </div>
          </section>

          {(attachments.length ?? 0) > 0 ? (
            <section className={styles.attachments}>
              <h2 className={styles.sectionTitle}>Attachments</h2>
              <div className={styles.attachmentRow}>
                {attachments.map((attachment) => (
                  <MailAttachmentPreview
                    key={attachment.id}
                    threadUid={threadUid}
                    replyId={replyId}
                    attachment={attachment}
                    preview={attachmentPreviewById[attachment.id]}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className={styles.statusLine}>Loading...</p>
      )}
    </div>
  )
}
