import { MarkdownPreview } from '@ootc/markdown'
import { useEffect, useState } from 'react'
import { FiRefreshCw } from 'react-icons/fi'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useI18n } from '../i18n/useI18n'
import type { ApiArticleDetail } from '../lib/api/search'
import { getArticleBySlug, rerunArticleForIntent, streamQuery } from '../lib/api/search'
import styles from './ArticlePage.module.css'
import '@ootc/markdown/style.css';

type LoadState = {
  isLoading: boolean
  error: string | null
  payload: ApiArticleDetail | null
}

export function ArticlePage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const [isRegenerating, setIsRegenerating] = useState(false)
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
  const canRegenerate = Boolean(query && state.payload.intent)
  const createdAtLabel = (() => {
    const parsed = new Date(article.createdAt)
    if (Number.isNaN(parsed.getTime())) return article.createdAt
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed)
  })()

  const regenerateArticle = async () => {
    if (!query || !state.payload?.intent || isRegenerating) return
    setIsRegenerating(true)
    const currentIntentId = state.payload.intent.id

    try {
      await rerunArticleForIntent(query.id, currentIntentId)

      let settled = false
      const unsubscribe = streamQuery({
        queryId: query.id,
        onEvent: async (event) => {
          if (settled) return
          if (event.type === 'article.created' && event.intentId === currentIntentId) {
            settled = true
            unsubscribe()
            const nextSlug = event.article.slug
            const nextHref = `/content/${encodeURIComponent(nextSlug)}?query=${encodeURIComponent(queryText || query.value)}${languageText && languageText !== 'auto' ? `&lang=${encodeURIComponent(languageText)}` : ''}`
            navigate(nextHref, { replace: true })
            try {
              const refreshed = await getArticleBySlug(nextSlug)
              setState({ isLoading: false, error: null, payload: refreshed })
            } finally {
              setIsRegenerating(false)
            }
            return
          }

          if (event.type === 'query.error' || event.type === 'query.completed') {
            settled = true
            unsubscribe()
            try {
              const refreshed = await getArticleBySlug(slug)
              setState({ isLoading: false, error: null, payload: refreshed })
            } finally {
              setIsRegenerating(false)
            }
          }
        },
        onError: () => {
          if (settled) return
          settled = true
          unsubscribe()
          setIsRegenerating(false)
        },
      })
    } catch {
      setIsRegenerating(false)
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.mainHeader}>
          <div className={styles.headerMeta}>
            <div className={styles.backRow}>
              <Link to={backToResultsHref}>{t('article.back.results')}</Link>
            </div>
            <p className={styles.createdAt}>
              {t('article.meta.createdAt', { value: createdAtLabel })}
            </p>
          </div>
          {canRegenerate ? (
            <button
              type="button"
              className={styles.regenerateButton}
              onClick={() => void regenerateArticle()}
              disabled={isRegenerating}
            >
              <FiRefreshCw className={isRegenerating ? styles.regenerateIconSpinning : styles.regenerateIcon} aria-hidden />
              <span>{isRegenerating ? t('article.action.regenerating') : t('article.action.regenerate')}</span>
            </button>
          ) : null}
        </div>
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
