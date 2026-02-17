import { useState } from 'react'
import { useNavigate } from 'react-router'
import { createContact } from '../lib/api/mail'

export function MailNewContactPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <h1>New Contact</h1>
      {error ? <p>{error}</p> : null}
      <form
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
        <p>
          <input name="name" placeholder="Name" />
        </p>
        <p>
          <input name="slug" placeholder="Slug" />
        </p>
        <p>
          <input name="icon" placeholder="Icon" />
        </p>
        <p>
          <input name="color" placeholder="Color" defaultValue="#6b7280" />
        </p>
        <p>
          <input name="defaultModel" placeholder="Default model" />
        </p>
        <p>
          <textarea name="instruction" placeholder="Instruction" rows={6} />
        </p>
        <button type="submit">Create</button>
      </form>
    </div>
  )
}
