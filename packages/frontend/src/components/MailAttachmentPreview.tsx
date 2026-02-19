import { Link } from 'react-router'
import { FiPaperclip } from 'react-icons/fi'
import type { ApiMailAttachmentSummary } from '../lib/api/mail'
import styles from './MailAttachmentPreview.module.css'

export type InlineAttachmentPreview = {
  kind: 'text' | 'image'
  textSnippet: string | null
  imageSrc: string | null
}

export function MailAttachmentPreview(props: {
  threadUid: string
  replyId: number
  attachment: ApiMailAttachmentSummary
  preview?: InlineAttachmentPreview
}) {
  const href = `/mail/thread/${props.threadUid}/reply/${props.replyId}/attachment/${props.attachment.slug}`

  return (
    <Link className={styles.card} to={href}>
      <span className={styles.head}>
        <FiPaperclip />
        <span className={styles.name}>{props.attachment.filename}</span>
        <span className={styles.kind}>{props.attachment.kind}</span>
      </span>

      {props.preview?.kind === 'image' && props.preview.imageSrc ? (
        <img className={styles.image} src={props.preview.imageSrc} alt={props.attachment.filename} />
      ) : null}

      {props.preview?.kind === 'text' ? (
        <span className={styles.text}>{props.preview.textSnippet || '(empty text file)'}</span>
      ) : null}
    </Link>
  )
}
