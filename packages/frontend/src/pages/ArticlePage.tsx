import { MarkdownPreview } from '@ootc/markdown'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useI18n } from '../i18n/useI18n'
import type { ApiArticleDetail } from '../lib/api/search'
import { getArticleBySlug } from '../lib/api/search'
import styles from './ArticlePage.module.css'
import '@ootc/markdown/style.css';

type LoadState = {
  isLoading: boolean
  error: string | null
  payload: ApiArticleDetail | null
}

export function ArticlePage() {
  const { t } = useI18n()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<LoadState>({
    isLoading: true,
    error: null,
    payload: null,
  })

  const slug = params.slug ?? ''
  const queryText = searchParams.get('query') ?? ''
  const languageText = searchParams.get('lang')?.trim() || ''

  useEffect(() => {
    document.title = state.payload?.article.title ? `${state.payload.article.title} | yah` : t('article.page.title')
  }, [state.payload?.article.title, t])

  useEffect(() => {
    if (!slug) {
      setState({ isLoading: false, error: t('article.error.missingSlug'), payload: null })
      return
    }

    let isMounted = true
    setState({ isLoading: true, error: null, payload: null })

    void getArticleBySlug(slug)
      .then((payload) => {
        if (!isMounted) return
        setState({ isLoading: false, error: null, payload })
      })
      .catch((error: unknown) => {
        if (!isMounted) return
        setState({
          isLoading: false,
          error: error instanceof Error ? error.message : t('article.error.load'),
          payload: null,
        })
      })

    return () => {
      isMounted = false
    }
  }, [slug, t])

  if (state.isLoading) return <div className={styles.loading}>{t('article.loading')}</div>

  if (state.error || !state.payload) {
    return (
      <div className={styles.errorWrap}>
        <p className={styles.errorText}>{state.error ?? t('article.error.notFound')}</p>
        <Link to="/search">{t('article.back.search')}</Link>
      </div>
    )
  }

  const { article, query, relatedIntents } = state.payload
  const backToResultsHref = query
    ? `/search?query=${encodeURIComponent(queryText || query.value)}${languageText && languageText !== 'auto' ? `&lang=${encodeURIComponent(languageText)}` : ''}`
    : '/search'

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.backRow}>
          <Link to={backToResultsHref}>{t('article.back.results')}</Link>
        </div>
        <h1>{article.title}</h1>
        <MarkdownPreview content={article.content} />
      </main>

      <aside className={styles.sidebar}>
        {query ? (
          <>
            <h3>{t('article.related.query')}</h3>
            <p>
              <Link to={`/search?query=${encodeURIComponent(query.value)}`}>{query.value}</Link>
            </p>
          </>
        ) : null}

        {query ? (
          <>
            <h3>{t('article.related.intents')}</h3>
            {relatedIntents.length === 0 ? <p>{t('article.related.none')}</p> : null}
            <ul className={styles.sidebarList}>
              {relatedIntents.map((intent) => (
                <li key={intent.id}>{intent.intent}</li>
              ))}
            </ul>
          </>
        ) : null}
      </aside>
    </div>
  )
}
