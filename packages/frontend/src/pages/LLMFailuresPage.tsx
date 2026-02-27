import { useEffect, useMemo, useState } from 'react'
import { FiChevronDown, FiChevronRight } from 'react-icons/fi'
import { listLLMFailures, type ApiLLMFailure } from '../lib/api/llm'
import { useI18n } from '../i18n/useI18n'
import styles from './LLMFailuresPage.module.css'

const PAGE_SIZE = 30

export function LLMFailuresPage() {
  const { t, locale } = useI18n()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ApiLLMFailure[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [provider, setProvider] = useState('')
  const [trigger, setTrigger] = useState('')
  const [expandedFailureIds, setExpandedFailureIds] = useState<Record<number, boolean>>({})

  const load = async () => {
    setIsLoading(true)
    try {
      const payload = await listLLMFailures({
        limit: PAGE_SIZE,
        offset,
        provider: provider || undefined,
        trigger: trigger || undefined,
      })
      setItems(payload.failures)
      setTotal(payload.pagination.total)
      if (payload.failures.length === 0) {
        setExpandedFailureIds({})
      } else {
        const allowed = new Set(payload.failures.map((item) => item.id))
        setExpandedFailureIds((prev) => {
          const next: Record<number, boolean> = {}
          for (const key of Object.keys(prev)) {
            const id = Number(key)
            if (allowed.has(id)) next[id] = true
          }
          return next
        })
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('llmFailures.error.load'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    document.title = t('llmFailures.page.title')
  }, [t])

  useEffect(() => {
    setOffset(0)
  }, [provider, trigger])

  useEffect(() => {
    void load()
  }, [provider, trigger, offset])

  const providers = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) set.add(item.provider)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [items])

  const triggers = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) set.add(item.trigger)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [items])

  const formatTime = (value: string) => {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(parsed)
  }

  const pretty = (value: unknown): string => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      setError('Failed to copy')
    }
  }

  const parseDetails = (item: ApiLLMFailure): Record<string, unknown> => {
    if (!item.detailsJson) return {}
    try {
      return JSON.parse(item.detailsJson) as Record<string, unknown>
    } catch {
      return { raw: item.detailsJson }
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('llmFailures.title')}</h1>
        <button type="button" className={styles.button} onClick={() => void load()}>
          {t('llmFailures.refresh')}
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {isLoading ? <p className={styles.status}>{t('llmFailures.loading')}</p> : null}

      <section className={styles.section}>
        <div className={styles.controls}>
          <label className={styles.field}>
            <span>{t('llmFailures.provider')}</span>
            <select className={styles.select} value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="">{t('llmFailures.all')}</option>
              {providers.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>{t('llmFailures.trigger')}</span>
            <select className={styles.select} value={trigger} onChange={(event) => setTrigger(event.target.value)}>
              <option value="">{t('llmFailures.all')}</option>
              {triggers.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <div></div>
            <div>{t('llmFailures.time')}</div>
            <div>{t('llmFailures.provider')}</div>
            <div>{t('llmFailures.trigger')}</div>
            <div>{t('llmFailures.error')}</div>
          </div>

          {items.map((item) => {
            const isExpanded = Boolean(expandedFailureIds[item.id])
            const details = parseDetails(item)
            const llmDetails = (details.llmDetails as Record<string, unknown> | undefined) || {}
            const requestBody = llmDetails.requestBody ?? null
            const responseBody = llmDetails.responseBody ?? details.providerError ?? details.response ?? null

            return (
              <div key={item.id} className={styles.rowGroup}>
                <button
                  type="button"
                  className={`${styles.row} ${isExpanded ? styles.rowExpanded : ''}`}
                  onClick={() => setExpandedFailureIds((current) => ({ ...current, [item.id]: !current[item.id] }))}
                >
                  <span className={styles.expandIcon}>{isExpanded ? <FiChevronDown /> : <FiChevronRight />}</span>
                  <span className={styles.mono}>{formatTime(item.createdAt)}</span>
                  <span>
                    <div className={styles.cellStrong}>{item.provider}</div>
                    <div className={styles.cellSub}>{item.component}</div>
                  </span>
                  <span>
                    <div className={styles.cellStrong}>{item.trigger}</div>
                    <div className={styles.cellSub}>
                      {item.model || '-'}
                      {item.attempt ? ` · attempt ${item.attempt}` : ''}
                      {typeof item.durationMs === 'number' ? ` · ${item.durationMs}ms` : ''}
                    </div>
                  </span>
                  <span>
                    <div className={styles.cellStrong}>{item.errorName}</div>
                    <div className={styles.cellSub}>{item.errorMessage}</div>
                  </span>
                </button>

                {isExpanded ? (
                  <div className={styles.expandedRow}>
                    <div className={styles.metaGrid}>
                      <span>ID: {item.id}</span>
                      <span>query_id: {item.queryId ?? '-'}</span>
                      <span>intent_id: {item.intentId ?? '-'}</span>
                      <span>order_id: {item.orderId ?? '-'}</span>
                      <span>call_id: {item.callId ?? '-'}</span>
                    </div>

                    <div className={styles.detailBlocks}>
                      <section className={styles.detailBlock}>
                        <h3 className={styles.detailBlockTitle}>
                          {t('llmFailures.requestBody')}
                          <button type="button" className={styles.copyButton} onClick={() => void copyText(pretty(requestBody))}>Copy</button>
                        </h3>
                        <pre className={styles.detailCode}>{pretty(requestBody)}</pre>
                      </section>
                      <section className={styles.detailBlock}>
                        <h3 className={styles.detailBlockTitle}>
                          {t('llmFailures.responseBody')}
                          <button type="button" className={styles.copyButton} onClick={() => void copyText(pretty(responseBody))}>Copy</button>
                        </h3>
                        <pre className={styles.detailCode}>{pretty(responseBody)}</pre>
                      </section>
                    </div>

                    <section className={styles.detailBlockFull}>
                      <h3 className={styles.detailBlockTitle}>
                        {t('llmFailures.rawDetails')}
                        <button type="button" className={styles.copyButton} onClick={() => void copyText(pretty(details))}>Copy</button>
                      </h3>
                      <pre className={styles.detailCode}>{pretty(details)}</pre>
                    </section>
                  </div>
                ) : null}
              </div>
            )
          })}

          {!isLoading && items.length === 0 ? (
            <p className={styles.status}>{t('llmFailures.empty')}</p>
          ) : null}
        </div>
        <div className={styles.pagination}>
          <span className={styles.paginationText}>
            {total === 0 ? '0' : `${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} / ${total}`}
          </span>
          <button type="button" className={styles.pageButton} disabled={offset <= 0} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>
            Prev
          </button>
          <button
            type="button"
            className={styles.pageButton}
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
