import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { getAttachment } from '../lib/api/mail'

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
  const threadUid = params.threadId ?? ''
  const replyId = Number.parseInt(params.replyId ?? '', 10)
  const attachmentSlug = params.attachmentSlug ?? ''

  const [attachment, setAttachment] = useState<AttachmentPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    <div>
      <h1>Attachment</h1>
      {error ? <p>{error}</p> : null}
      {!attachment ? <p>Loading...</p> : null}
      {attachment?.kind === 'text' ? <pre>{attachment.textContent ?? ''}</pre> : null}
      {attachment?.kind === 'image' && attachment.base64Content ? (
        <img
          alt={attachment.filename}
          src={`data:${attachment.mimeType};base64,${attachment.base64Content}`}
          style={{ maxWidth: '100%' }}
        />
      ) : null}
    </div>
  )
}
