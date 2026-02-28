import { CodeBlock, MarkdownPreview } from '@ootc/markdown'
import { useEffect, useState } from 'react'
import { FiRefreshCw } from 'react-icons/fi'
import { Link, useParams, useSearchParams } from 'react-router'
import { useI18n } from '../i18n/useI18n'
import type { ApiArticleDetail } from '../lib/api/search'
import { createOrder, createQuery, getArticleBySlug, getGenerationEtaByAction, isResourceLockedError, streamOrder } from '../lib/api/search'
import styles from './ArticlePage.module.css'
import '@ootc/markdown/style.css';

type LoadState = {
  isLoading: boolean
  error: string | null
  payload: ApiArticleDetail | null
}

const DEFAULT_ARTICLE_ETA_MS = 8000

function formatDurationShort(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

export function ArticlePage() {
  const { t, locale } = useI18n()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [etaAverageMs, setEtaAverageMs] = useState<number>(DEFAULT_ARTICLE_ETA_MS)
  const [etaEnabled, setEtaEnabled] = useState(true)
  const [regenElapsedMs, setRegenElapsedMs] = useState(0)
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
    let cancelled = false
    void getGenerationEtaByAction('content')
      .then((payload) => {
        if (cancelled) return
        setEtaEnabled(payload.enabled)
        if (typeof payload.averageDurationMs === 'number' && payload.averageDurationMs > 0) {
          setEtaAverageMs(payload.averageDurationMs)
        } else {
          setEtaAverageMs(DEFAULT_ARTICLE_ETA_MS)
        }
      })
      .catch(() => {
        if (cancelled) return
        setEtaEnabled(true)
        setEtaAverageMs(DEFAULT_ARTICLE_ETA_MS)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isRegenerating) {
      setRegenElapsedMs(0)
      return
    }
    const startedAt = Date.now()
    const timer = setInterval(() => {
      setRegenElapsedMs(Date.now() - startedAt)
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [isRegenerating])

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

  useEffect(() => {
    if (!state.payload) return
    const payload = state.payload
    const article = payload.article
    const orderId = payload.activeOrderId
    if (article.content && article.status === 'content_ready') return
    if (typeof orderId !== 'number' || orderId <= 0) return

    setIsRegenerating(true)
    let mounted = true
    const unsubscribe = streamOrder({
      orderId,
      onEvent: async (event) => {
        if (!mounted) return
        if (event.type === 'order.completed' || event.type === 'order.failed') {
          unsubscribe()
          try {
            const refreshed = await getArticleBySlug(article.slug)
            if (!mounted) return
            setState({ isLoading: false, error: null, payload: refreshed })
          } catch (error) {
            if (!mounted) return
            setState({
              isLoading: false,
              error: error instanceof Error ? error.message : t('article.error.load'),
              payload: null,
            })
          } finally {
            if (mounted) setIsRegenerating(false)
          }
        }
      },
      onError: () => {
        if (!mounted) return
        setIsRegenerating(false)
      },
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [state.payload, t])

  if (state.isLoading) return <div className={styles.loading}>{t('article.loading')}</div>

  if (state.error || !state.payload) {
    return (
      <div className={styles.errorWrap}>
        <p className={styles.errorText}>{state.error ?? t('article.error.notFound')}</p>
        <Link to="/search">{t('article.back.search')}</Link>
      </div>
    )
  }

  const { article, query, recommendedArticles } = state.payload
  const filetype = (article.filetype || 'md').toLowerCase()
  const isMarkdown = filetype === 'md' || filetype === 'markdown'
  const codeLanguage = filetype === 'bash' || filetype === 'zsh' ? 'sh' : filetype
  const backToResultsHref = query
    ? `/search?query=${encodeURIComponent(queryText || query.value)}${languageText && languageText !== 'auto' ? `&lang=${encodeURIComponent(languageText)}` : ''}`
    : '/search'
  const canRegenerate = true
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
  const typicalTotalMs = etaEnabled ? etaAverageMs : null
  const etaMs = typicalTotalMs !== null ? Math.max(0, typicalTotalMs - regenElapsedMs) : null
  const overrunMs = typicalTotalMs !== null && regenElapsedMs > typicalTotalMs ? regenElapsedMs - typicalTotalMs : null
  const regenTimingLabel = isRegenerating
    ? [
        t('search.status.elapsed', { value: formatDurationShort(regenElapsedMs) }),
        typicalTotalMs !== null ? t('search.status.typicalTotal', { value: formatDurationShort(typicalTotalMs) }) : null,
        overrunMs !== null
          ? t('search.status.longerThanUsual', { value: formatDurationShort(overrunMs) })
          : etaMs !== null
            ? t('search.status.eta', { value: formatDurationShort(etaMs) })
            : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  const regenerateArticle = async () => {
    if (isRegenerating) return
    setIsRegenerating(true)
    const currentIntentId = state.payload?.intent?.id
    let currentQueryId = query?.id ?? null

    try {
      if (!currentQueryId) {
        const createdQuery = await createQuery({
          query: article.title,
          language: languageText || 'en',
          spellCorrectionMode: 'off',
        })
        currentQueryId = createdQuery.queryId
      }
      let orderId: number
      try {
        const created = await createOrder({
          kind: 'article_content_generate',
          queryId: currentQueryId,
          intentId: currentIntentId,
          articleId: currentIntentId ? undefined : article.id,
        })
        orderId = created.orderId
      } catch (error) {
        if (!isResourceLockedError(error) || typeof error.payload?.activeOrderId !== 'number') {
          throw error
        }
        orderId = error.payload.activeOrderId
      }

      let settled = false
      const unsubscribe = streamOrder({
        orderId,
        onEvent: async (event) => {
          if (settled) return
          if (event.type === 'order.failed' || event.type === 'order.completed') {
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
            <h1 className={styles.articleTitle}>{article.title}</h1>
            <div className={styles.backRow}>
              <Link to={backToResultsHref}>{t('article.back.results')}</Link>
            </div>
            <p className={styles.createdAt}>
              {t('article.meta.createdAt', { value: createdAtLabel })}
            </p>
            <p className={styles.generatedBy}>{article.summary}</p>
            {article.generatedBy ? (
              <p className={styles.generatedBy}>
                {t('article.meta.generatedBy', { value: article.generatedBy })}
              </p>
            ) : null}
          </div>
          {canRegenerate ? (
            <div className={styles.regenerateWrap}>
              <button
                type="button"
                className={styles.regenerateButton}
                onClick={() => void regenerateArticle()}
                disabled={isRegenerating}
              >
                <FiRefreshCw className={isRegenerating ? styles.regenerateIconSpinning : styles.regenerateIcon} aria-hidden />
                <span>{t('article.action.regenerate')}</span>
              </button>
              {regenTimingLabel ? <p className={styles.regenerateMeta}>{regenTimingLabel}</p> : null}
            </div>
          ) : null}
        </div>
        {!article.content ? (
          <div>
            <p className={styles.contentLoadingNotice}>
              {t('article.status.generatingContent')}
              {regenTimingLabel ? ` ${regenTimingLabel}` : ''}
            </p>
            <div className={styles.contentSkeleton} aria-hidden>
              <div className={styles.contentSkeletonLineLg} />
              <div className={styles.contentSkeletonLineMd} />
              <div className={styles.contentSkeletonLineSm} />
              <div className={styles.contentSkeletonBlock} />
              <div className={styles.contentSkeletonLineMd} />
              <div className={styles.contentSkeletonLineSm} />
              <div className={styles.contentSkeletonBlock} />
            </div>
          </div>
        ) : isMarkdown ? (
          <MarkdownPreview content={article.content} />
        ) : (
          <CodeBlock code={article.content} language={codeLanguage} />
        )}
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

        <>
          <h3>{t('article.related.articles')}</h3>
          {recommendedArticles.length === 0 && !isRegenerating ? <p>{t('article.related.none')}</p> : null}
          {recommendedArticles.length === 0 && isRegenerating ? (
            <div className={styles.sidebarSkeleton} aria-hidden>
              <div className={styles.sidebarSkeletonLine} />
              <div className={styles.sidebarSkeletonLineShort} />
              <div className={styles.sidebarSkeletonLine} />
              <div className={styles.sidebarSkeletonLineShort} />
            </div>
          ) : null}
          <ul className={styles.sidebarList}>
            {recommendedArticles.map((recommended) => (
              <li key={recommended.id}>
                <Link
                  to={`/content/${encodeURIComponent(recommended.slug)}${query ? `?query=${encodeURIComponent(queryText || query.value)}${languageText && languageText !== 'auto' ? `&lang=${encodeURIComponent(languageText)}` : ''}` : ''}`}
                >
                  {recommended.title}
                </Link>
                <p className={styles.generatedBy}>{recommended.summary}</p>
              </li>
            ))}
          </ul>
        </>
      </aside>
    </div>
  )
}
