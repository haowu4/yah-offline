import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { createContact } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import { ColorPicker } from '../components/ColorPicker'
import styles from './MailCommon.module.css'

export function MailNewContactPage() {
  const navigate = useNavigate()
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const [error, setError] = useState<string | null>(null)
  const [color, setColor] = useState('#6b7280')

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
            color,
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
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="new-contact-name">Name</label>
          <input id="new-contact-name" className={styles.input} name="name" placeholder="Name" />
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="new-contact-slug">Slug</label>
            <input id="new-contact-slug" className={styles.input} name="slug" placeholder="Slug" />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="new-contact-icon">Icon</label>
            <input id="new-contact-icon" className={styles.input} name="icon" placeholder="Icon" />
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="new-contact-color">Color</label>
            <ColorPicker id="new-contact-color" name="color" value={color} onChange={setColor} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="new-contact-default-model">Default Model</label>
            <input
              id="new-contact-default-model"
              className={styles.input}
              name="defaultModel"
              placeholder="Default model"
            />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="new-contact-instruction">Instruction</label>
          <textarea
            id="new-contact-instruction"
            className={styles.textarea}
            name="instruction"
            placeholder="Instruction"
            rows={6}
          />
        </div>
        <button className={styles.button} type="submit">Create</button>
      </form>
    </div>
  )
}
