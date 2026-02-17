import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { listContacts } from '../lib/api/mail'
import type { ApiMailContact } from '../lib/api/mail'

export function MailContactListPage() {
  const [contacts, setContacts] = useState<ApiMailContact[]>([])
  const [error, setError] = useState<string | null>(null)

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
    <div>
      <h1>Contacts</h1>
      <p>
        <Link to="/mail/new-contact">Create contact</Link>
      </p>
      {error ? <p>{error}</p> : null}
      <ul>
        {contacts.map((contact) => (
          <li key={contact.id}>
            <Link to={`/mail/contact/${contact.slug}`}>{contact.name}</Link> ({contact.slug})
          </li>
        ))}
      </ul>
    </div>
  )
}
