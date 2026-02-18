import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { listContacts } from '../lib/api/mail'
import type { ApiMailContact } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import styles from './MailCommon.module.css'

export function MailContactListPage() {
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const [contacts, setContacts] = useState<ApiMailContact[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Mail', to: '/mail' },
      { label: 'Contacts' },
    ])
  }, [setBreadcrumbs])

  useEffect(() => {
    void listContacts()
      .then((payload) => {
        setContacts(payload.contacts)
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load contacts')
      })
  }, [])

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Contacts</h1>
      <div className={styles.actions}>
        <Link to="/mail/new-contact">Create contact</Link>
        <Link to="/mail">Back to threads</Link>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <ul className={styles.list}>
        {contacts.map((contact) => (
          <li key={contact.id} className={styles.item}>
            <p className={styles.itemTitle}>
              <Link to={`/mail/contact/${contact.slug}`}>{contact.name}</Link>
              <span className={styles.badge}>{contact.slug}</span>
            </p>
            <p className={styles.meta}>default model: {contact.defaultModel || 'not set'}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
