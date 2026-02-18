import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getContact, updateContact } from '../lib/api/mail'
import type { ApiMailContact } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import styles from './MailCommon.module.css'

export function MailContactDetailPage() {
  const params = useParams()
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const [contact, setContact] = useState<ApiMailContact | null>(null)
  const [error, setError] = useState<string | null>(null)

  const slug = params.slug ?? ''

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Mail', to: '/mail' },
      { label: 'Contacts', to: '/mail/contact' },
      { label: contact?.name || slug || 'Contact' },
    ])
  }, [contact?.name, setBreadcrumbs, slug])

  useEffect(() => {
    if (!slug) return
    void getContact(slug)
      .then((payload) => {
        setContact(payload.contact)
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load contact')
      })
  }, [slug])

  if (!slug) return <div className={styles.container}>Missing slug</div>

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Contact</h1>
      <div className={styles.actions}>
        <Link to="/mail/contact">Back to contacts</Link>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {!contact ? <p className={styles.statusLine}>Loading...</p> : null}
      {contact ? (
        <form
          className={styles.formGrid}
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            void updateContact(slug, {
              name: String(form.get('name') ?? '').trim() || undefined,
              slug: String(form.get('slug') ?? '').trim() || undefined,
              instruction: String(form.get('instruction') ?? '').trim() || undefined,
              icon: String(form.get('icon') ?? '').trim() || undefined,
              color: String(form.get('color') ?? '').trim() || undefined,
              defaultModel: String(form.get('defaultModel') ?? '').trim() || undefined,
            })
              .then((payload) => {
                setContact(payload.contact)
                setError(null)
              })
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Failed to update contact')
              })
          }}
        >
          <input className={styles.input} name="name" defaultValue={contact.name} placeholder="Name" />
          <div className={styles.row}>
            <input className={styles.input} name="slug" defaultValue={contact.slug} placeholder="Slug" />
            <input className={styles.input} name="icon" defaultValue={contact.icon} placeholder="Icon" />
          </div>
          <div className={styles.row}>
            <input className={styles.input} name="color" defaultValue={contact.color} placeholder="Color" />
            <input
              className={styles.input}
              name="defaultModel"
              defaultValue={contact.defaultModel ?? ''}
              placeholder="Default model"
            />
          </div>
          <textarea className={styles.textarea} name="instruction" defaultValue={contact.instruction} rows={6} />
          <button className={styles.button} type="submit">Save</button>
        </form>
      ) : null}
    </div>
  )
}
