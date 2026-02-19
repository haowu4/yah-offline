import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { createContact, listModelCandidates, uploadContactIconMultipart } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import { ColorPicker } from '../components/ColorPicker'
import { ModelCombobox } from '../components/ModelCombobox'
import { normalizeContactIcon } from '../lib/contactIcon'
import styles from './MailCommon.module.css'

export function MailNewContactPage() {
  const navigate = useNavigate()
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const [error, setError] = useState<string | null>(null)
  const [color, setColor] = useState('#6b7280')
  const [modelCandidates, setModelCandidates] = useState<string[]>([])
  const [defaultModel, setDefaultModel] = useState('')

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Mail', to: '/mail' },
      { label: 'Contacts', to: '/mail/contact' },
      { label: 'New Contact' },
    ])
  }, [setBreadcrumbs])

  useEffect(() => {
    void listModelCandidates()
      .then((payload) => {
        setModelCandidates(payload.models)
      })
      .catch(() => {
        setModelCandidates([])
      })
  }, [])

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
          const iconFile = form.get('iconFile')
          if (!name) {
            setError('name is required')
            return
          }

          void createContact({
            name,
            slug: String(form.get('slug') ?? '').trim() || undefined,
            instruction: String(form.get('instruction') ?? '').trim() || undefined,
            color,
            defaultModel: defaultModel.trim() || undefined,
          })
            .then(async (payload) => {
              if (iconFile instanceof File && iconFile.size > 0) {
                const normalized = await normalizeContactIcon(iconFile)
                const pngFile = new File([normalized], 'icon.png', { type: 'image/png' })
                const uploaded = await uploadContactIconMultipart(payload.contact.slug, pngFile)
                navigate(`/mail/contact/${uploaded.contact.slug}`)
                return
              }
              navigate(`/mail/contact/${payload.contact.slug}`)
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Failed to create contact')
            })
        }}
      >
        <div className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>Identity</h2>
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
              <label className={styles.fieldLabel} htmlFor="new-contact-color">Color</label>
              <ColorPicker id="new-contact-color" name="color" value={color} onChange={setColor} />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="new-contact-default-model">Default Model</label>
            <ModelCombobox
              id="new-contact-default-model"
              name="defaultModel"
              inputClassName={styles.input}
              value={defaultModel}
              onChange={setDefaultModel}
              options={modelCandidates}
              placeholder="Default model"
            />
          </div>
        </div>
        <div className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>Icon</h2>
          <div className={styles.iconGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="new-contact-icon-file">Icon File</label>
              <input
                id="new-contact-icon-file"
                className={styles.input}
                name="iconFile"
                type="file"
                accept="image/png,image/jpeg"
              />
              <p className={styles.hintText}>Accepted: PNG, JPEG. Saved as PNG.</p>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Current Icon</label>
              <div className={styles.iconPreviewBox}>
                <p className={styles.hintText}>No icon</p>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>Instruction</h2>
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
        </div>
        <div className={styles.actionsRow}>
          <button className={styles.button} type="submit">Create</button>
        </div>
      </form>
    </div>
  )
}
