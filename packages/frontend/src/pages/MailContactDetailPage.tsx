import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { getContact, updateContact } from '../lib/api/mail'
import type { ApiMailContact } from '../lib/api/mail'

export function MailContactDetailPage() {
  const params = useParams()
  const [contact, setContact] = useState<ApiMailContact | null>(null)
  const [error, setError] = useState<string | null>(null)

  const slug = params.slug ?? ''

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

  if (!slug) return <div>Missing slug</div>

  return (
    <div>
      <h1>Contact</h1>
      {error ? <p>{error}</p> : null}
      {!contact ? <p>Loading...</p> : null}
      {contact ? (
        <form
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
          <p>
            <input name="name" defaultValue={contact.name} placeholder="Name" />
          </p>
          <p>
            <input name="slug" defaultValue={contact.slug} placeholder="Slug" />
          </p>
          <p>
            <input name="icon" defaultValue={contact.icon} placeholder="Icon" />
          </p>
          <p>
            <input name="color" defaultValue={contact.color} placeholder="Color" />
          </p>
          <p>
            <input name="defaultModel" defaultValue={contact.defaultModel ?? ''} placeholder="Default model" />
          </p>
          <p>
            <textarea name="instruction" defaultValue={contact.instruction} rows={6} />
          </p>
          <button type="submit">Save</button>
        </form>
      ) : null}
    </div>
  )
}
