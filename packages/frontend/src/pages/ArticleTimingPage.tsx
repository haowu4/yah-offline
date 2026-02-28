import { useCallback, useEffect, useState } from 'react'
import { listArticleGenerationRuns, type ApiArticleGenerationRun } from '../lib/api/articleTiming'
import { useI18n } from '../i18n/useI18n'
import styles from './ArticleTimingPage.module.css'

const PAGE_SIZE = 30

export function ArticleTimingPage() {
  const { locale } = useI18n()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runs, setRuns] = useState<ApiArticleGenerationRun[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [statusFilter, setStatusFilter] = useState<ApiArticleGenerationRun['status'] | ''>('')
  const [kindFilter, setKindFilter] = useState<ApiArticleGenerationRun['kind'] | ''>('')

  const loadRuns = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent)
    if (!silent) setIsLoading(true)
    try {
      const payload = await listArticleGenerationRuns({
        limit: PAGE_SIZE,
        offset,
        status: statusFilter || undefined,
        kind: kindFilter || undefined,
      })
      setRuns(payload.runs)
      setTotal(payload.pagination.total)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load article timing logs')
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [offset, statusFilter, kindFilter])

  useEffect(() => {
    document.title = 'Generation Performance | yah'
  }, [])

  useEffect(() => {
    setOffset(0)
  }, [statusFilter, kindFilter])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadRuns({ silent: true })
    }, 2000)
    return () => window.clearInterval(timer)
  }, [loadRuns])

  const formatTime = (value: string | null) => {
    if (!value) return '-'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(parsed)
  }

  const formatDuration = (value: number | null) => {
    if (value == null || !Number.isFinite(value)) return '-'
    const seconds = value / 1000
    return `${seconds.toFixed(1)}s`
  }

  const statusClassName = (status: ApiArticleGenerationRun['status']) => {
    if (status === 'completed') return `${styles.statusBadge} ${styles.statusCompleted}`
    if (status === 'failed') return `${styles.statusBadge} ${styles.statusFailed}`
    return `${styles.statusBadge} ${styles.statusRunning}`
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.heading}>Generation Performance</h1>
        
        <button type="button" className={styles.refreshBtn} onClick={() => void loadRuns()}>
          Refresh
        </button>
      </div>

      {error ? <p className={styles.errorNotice}>{error}</p> : null}
      {isLoading ? <p className={styles.infoNotice}>Loading article timing logs...</p> : null}

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <label className={styles.filterGroup}>
            <span>Status</span>
            <select className={styles.filterSelect} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ApiArticleGenerationRun['status'] | '')}>
              <option value="">All</option>
              <option value="running">running</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
            </select>
          </label>
          <label className={styles.filterGroup}>
            <span>Kind</span>
            <select className={styles.filterSelect} value={kindFilter} onChange={(event) => setKindFilter(event.target.value as ApiArticleGenerationRun['kind'] | '')}>
              <option value="">All</option>
              <option value="preview">preview</option>
              <option value="content">content</option>
            </select>
          </label>
        </div>

        <div className={styles.tableWrap}>
          <div className={styles.table}>
            <div className={styles.head}>
              <div className={styles.cell}>Run ID</div>
              <div className={styles.cell}>Status</div>
              <div className={styles.cell}>Kind</div>
              <div className={styles.cell}>Order</div>
              <div className={styles.cell}>Query</div>
              <div className={styles.cell}>Intent</div>
              <div className={styles.cell}>Article</div>
              <div className={styles.cell}>Attempts</div>
              <div className={styles.cell}>Duration</div>
              <div className={styles.cell}>LLM</div>
              <div className={styles.cell}>Started</div>
              <div className={styles.cell}>Finished</div>
            </div>

            {runs.map((run) => (
              <div key={run.id} className={styles.row}>
                <span className={`${styles.cell} ${styles.mono}`}>#{run.id}</span>
                <span className={styles.cell}><span className={statusClassName(run.status)}>{run.status}</span></span>
                <span className={styles.cell}>{run.kind}</span>
                <span className={`${styles.cell} ${styles.mono}`}>#{run.orderId}</span>
                <span className={`${styles.cell} ${styles.mono}`}>#{run.queryId}</span>
                <span className={`${styles.cell} ${styles.mono}`}>{run.intentId ? `#${run.intentId}` : '-'}</span>
                <span className={`${styles.cell} ${styles.mono}`}>{run.articleId ? `#${run.articleId}` : '-'}</span>
                <span className={styles.cell}>{run.attempts ?? '-'}</span>
                <span className={styles.cell}>{formatDuration(run.durationMs)}</span>
                <span className={styles.cell}>{formatDuration(run.llmDurationMs)}</span>
                <span className={`${styles.cell} ${styles.mono}`}>{formatTime(run.startedAt)}</span>
                <span className={`${styles.cell} ${styles.mono}`}>{formatTime(run.finishedAt)}</span>
              </div>
            ))}
          </div>
        </div>
        {!isLoading && runs.length === 0 ? (
          <p className={styles.empty}>No timing runs found.</p>
        ) : null}

        <div className={styles.pager}>
          <span className={styles.pagerText}>
            {total === 0 ? '0' : `${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} / ${total}`}
          </span>
          <button type="button" className={styles.pagerBtn} disabled={offset <= 0} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>
            Prev
          </button>
          <button
            type="button"
            className={styles.pagerBtn}
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((value) => value + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  )
}
