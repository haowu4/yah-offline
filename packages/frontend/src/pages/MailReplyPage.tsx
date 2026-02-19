import { MarkdownPreview } from '@ootc/markdown'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { FiPaperclip } from 'react-icons/fi'
import { getAttachment, getReply } from '../lib/api/mail'
import type { ApiMailAttachmentSummary, ApiMailReply } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import styles from './MailReplyPage.module.css'

export function MailReplyPage() {
  const params = useParams()
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const threadUid = params.threadId ?? ''
  const replyId = Number.parseInt(params.replyId ?? '', 10)
  const [reply, setReply] = useState<ApiMailReply | null>(null)
  const [attachments, setAttachments] = useState<ApiMailAttachmentSummary[]>([])
  const [attachmentPreviewById, setAttachmentPreviewById] = useState<
    Record<number, { kind: 'text' | 'image'; textSnippet: string | null; imageSrc: string | null }>
  >({})
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
        const preview =
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

          {(attachments.length ?? 0) > 0 ? (
            <section className={styles.attachments}>
              <h2 className={styles.sectionTitle}>Attachments</h2>
              <div className={styles.attachmentRow}>
                {attachments.map((attachment) => (
                  <div key={attachment.id} className={styles.attachmentCard}>
                    <Link
                      className={styles.attachmentChip}
                      to={`/mail/thread/${threadUid}/reply/${replyId}/attachment/${attachment.slug}`}
                    >
                      <FiPaperclip />
                      <span>{attachment.filename}</span>
                      <span className={styles.badge}>{attachment.kind}</span>
                    </Link>
                    {attachmentPreviewById[attachment.id]?.kind === 'image' &&
                    attachmentPreviewById[attachment.id].imageSrc ? (
                      <Link
                        className={styles.attachmentPreviewLink}
                        to={`/mail/thread/${threadUid}/reply/${replyId}/attachment/${attachment.slug}`}
                      >
                        <img
                          className={styles.attachmentImagePreview}
                          src={attachmentPreviewById[attachment.id].imageSrc ?? ''}
                          alt={attachment.filename}
                        />
                      </Link>
                    ) : null}
                    {attachmentPreviewById[attachment.id]?.kind === 'text' ? (
                      <Link
                        className={styles.attachmentTextPreview}
                        to={`/mail/thread/${threadUid}/reply/${replyId}/attachment/${attachment.slug}`}
                      >
                        {attachmentPreviewById[attachment.id].textSnippet || '(empty text file)'}
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className={styles.contentCard}>
            <h2 className={styles.sectionTitle}>Content</h2>
            <div className={styles.markdown}>
              <MarkdownPreview content={reply.content} />
            </div>
          </section>
        </>
      ) : (
        <p className={styles.statusLine}>Loading...</p>
      )}
    </div>
  )
}
