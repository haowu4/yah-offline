import { MarkdownPreview } from '@ootc/markdown'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getGuideDoc, type ApiGuideDoc } from '../lib/api/guide'
import styles from './GuidePage.module.css'
import '@ootc/markdown/style.css'

export function GuideDocPage() {
  const params = useParams()
  const slug = params.slug?.trim() || ''
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [doc, setDoc] = useState<ApiGuideDoc | null>(null)

  useEffect(() => {
    if (!doc?.title) return
    document.title = `${doc.title} | yah`
  }, [doc?.title])

  useEffect(() => {
    let cancelled = false
    if (!slug) {
      setError('Missing guide slug')
      setIsLoading(false)
      return () => {
        cancelled = true
      }
    }

    setIsLoading(true)
    setError(null)
    void getGuideDoc(slug)
      .then((payload) => {
        if (cancelled) return
        setDoc(payload)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load guide')
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.backLink} to="/guide">Back to Guides</Link>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {isLoading ? <p className={styles.status}>Loading guide...</p> : null}
      {!isLoading && doc ? <MarkdownPreview content={doc.markdown} /> : null}
    </div>
  )
}
