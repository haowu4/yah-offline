import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { createContact } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import styles from './MailCommon.module.css'

export function MailNewContactPage() {
  const navigate = useNavigate()
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Mail', to: '/mail' },
      { label: 'Contacts', to: '/mail/contact' },
      { label: 'New Contact' },
    ])
  }, [setBreadcrumbs])

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>New Contact</h1>
      {error ? <p className={styles.error}>{error}</p> : null}
      <form
        className={styles.formGrid}
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const name = String(form.get('name') ?? '').trim()
          if (!name) {
            setError('name is required')
            return
          }

          void createContact({
            name,
            slug: String(form.get('slug') ?? '').trim() || undefined,
            instruction: String(form.get('instruction') ?? '').trim() || undefined,
            icon: String(form.get('icon') ?? '').trim() || undefined,
            color: String(form.get('color') ?? '').trim() || undefined,
            defaultModel: String(form.get('defaultModel') ?? '').trim() || undefined,
          })
            .then((payload) => {
              navigate(`/mail/contact/${payload.contact.slug}`)
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Failed to create contact')
            })
        }}
      >
        <input className={styles.input} name="name" placeholder="Name" />
        <div className={styles.row}>
          <input className={styles.input} name="slug" placeholder="Slug" />
          <input className={styles.input} name="icon" placeholder="Icon" />
        </div>
        <div className={styles.row}>
          <input className={styles.input} name="color" placeholder="Color" defaultValue="#6b7280" />
          <input className={styles.input} name="defaultModel" placeholder="Default model" />
        </div>
        <textarea className={styles.textarea} name="instruction" placeholder="Instruction" rows={6} />
        <button className={styles.button} type="submit">Create</button>
      </form>
    </div>
  )
}
