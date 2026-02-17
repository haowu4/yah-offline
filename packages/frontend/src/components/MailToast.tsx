import { useMailCtx } from '../ctx/MailCtx'
import styles from './MailToast.module.css'

export function MailToastHost() {
  const mail = useMailCtx()

  if (mail.toasts.length === 0) return null

  return (
    <div className={styles.host}>
      {mail.toasts.map((toast) => (
        <button key={toast.id} className={styles.toast} onClick={() => mail.dismissToast(toast.id)}>
          {toast.message}
        </button>
      ))}
    </div>
  )
}
