import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { listGuideDocs, type ApiGuideIndexItem } from '../lib/api/guide'
import styles from './GuidePage.module.css'

export function GuideIndexPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [docs, setDocs] = useState<ApiGuideIndexItem[]>([])

  useEffect(() => {
    document.title = 'Guides | yah'
  }, [])

  useEffect(() => {
    let cancelled = false
    void listGuideDocs()
      .then((payload) => {
        if (cancelled) return
        setDocs(payload.docs)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load guides')
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Guides</h1>
      </header>
      {error ? <p className={styles.error}>{error}</p> : null}
      {isLoading ? <p className={styles.status}>Loading guides...</p> : null}
      {!isLoading && docs.length === 0 ? <p className={styles.status}>No guides found.</p> : null}

      <ul className={styles.list}>
        {docs.map((doc) => (
          <li key={doc.slug} className={styles.item}>
            <Link className={styles.link} to={`/guide/${encodeURIComponent(doc.slug)}`}>
              {doc.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
