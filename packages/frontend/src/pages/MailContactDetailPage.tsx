import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getContact, getContactIconUrl, updateContact, uploadContactIconMultipart } from '../lib/api/mail'
import type { ApiMailContact } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import { ColorPicker } from '../components/ColorPicker'
import { normalizeContactIcon } from '../lib/contactIcon'
import styles from './MailCommon.module.css'

export function MailContactDetailPage() {
  const params = useParams()
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const [contact, setContact] = useState<ApiMailContact | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [color, setColor] = useState('#6b7280')
  const [iconPreviewFailed, setIconPreviewFailed] = useState(false)

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
        setColor(payload.contact.color || '#6b7280')
        setError(null)
        setSaveNotice(null)
        setSaveError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load contact')
      })
  }, [slug])

  useEffect(() => {
    setIconPreviewFailed(false)
  }, [contact?.slug, contact?.updatedAt])

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
            setSaveNotice(null)
            setSaveError(null)
            const form = new FormData(event.currentTarget)
            const iconFile = form.get('iconFile')
            void updateContact(slug, {
              name: String(form.get('name') ?? '').trim() || undefined,
              slug: String(form.get('slug') ?? '').trim() || undefined,
              instruction: String(form.get('instruction') ?? '').trim() || undefined,
              color,
              defaultModel: String(form.get('defaultModel') ?? '').trim() || undefined,
            })
              .then(async (payload) => {
                let nextContact = payload.contact
                if (iconFile instanceof File && iconFile.size > 0) {
                  const normalized = await normalizeContactIcon(iconFile)
                  const pngFile = new File([normalized], 'icon.png', { type: 'image/png' })
                  const uploaded = await uploadContactIconMultipart(payload.contact.slug, pngFile)
                  nextContact = uploaded.contact
                }
                setContact(nextContact)
                setError(null)
                setSaveNotice('Saved successfully.')
              })
              .catch((err: unknown) => {
                setSaveError(err instanceof Error ? err.message : 'Failed to update contact')
              })
          }}
        >
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="edit-contact-name">Name</label>
            <input
              id="edit-contact-name"
              className={styles.input}
              name="name"
              defaultValue={contact.name}
              placeholder="Name"
            />
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="edit-contact-slug">Slug</label>
              <input
                id="edit-contact-slug"
                className={styles.input}
                name="slug"
                defaultValue={contact.slug}
                placeholder="Slug"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="edit-contact-icon-file">Icon File</label>
              <input
                id="edit-contact-icon-file"
                className={styles.input}
                name="iconFile"
                type="file"
                accept="image/png,image/jpeg"
              />
            </div>
          </div>
          {contact.iconLocation && !iconPreviewFailed ? (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Current Icon</label>
              <img
                className={styles.contactIconPreview}
                src={getContactIconUrl(contact.slug, contact.updatedAt)}
                alt={`${contact.name} icon`}
                onError={() => setIconPreviewFailed(true)}
              />
            </div>
          ) : null}
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="edit-contact-color">Color</label>
              <ColorPicker id="edit-contact-color" name="color" value={color} onChange={setColor} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="edit-contact-default-model">Default Model</label>
              <input
                id="edit-contact-default-model"
                className={styles.input}
                name="defaultModel"
                defaultValue={contact.defaultModel ?? ''}
                placeholder="Default model"
              />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="edit-contact-instruction">Instruction</label>
            <textarea
              id="edit-contact-instruction"
              className={styles.textarea}
              name="instruction"
              defaultValue={contact.instruction}
              rows={6}
            />
          </div>
          <button className={styles.button} type="submit">Save</button>
          {saveNotice ? <p className={styles.success}>{saveNotice}</p> : null}
          {saveError ? <p className={styles.error}>{saveError}</p> : null}
        </form>
      ) : null}
    </div>
  )
}
