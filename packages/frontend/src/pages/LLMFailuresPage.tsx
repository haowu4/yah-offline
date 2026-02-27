import { useEffect, useMemo, useState } from 'react'
import { listLLMFailures, type ApiLLMFailure } from '../lib/api/llm'
import { useI18n } from '../i18n/useI18n'
import styles from './LLMFailuresPage.module.css'

export function LLMFailuresPage() {
  const { t, locale } = useI18n()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ApiLLMFailure[]>([])
  const [provider, setProvider] = useState('')
  const [trigger, setTrigger] = useState('')
  const [selectedFailureId, setSelectedFailureId] = useState<number | null>(null)

  const load = async () => {
    setIsLoading(true)
    try {
      const payload = await listLLMFailures({ limit: 200, provider: provider || undefined, trigger: trigger || undefined })
      setItems(payload.failures)
      if (payload.failures.length > 0) {
        setSelectedFailureId((current) =>
          current && payload.failures.some((item) => item.id === current) ? current : payload.failures[0].id
        )
      } else {
        setSelectedFailureId(null)
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
    void load()
  }, [provider, trigger])

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

  const selected = useMemo(
    () => items.find((item) => item.id === selectedFailureId) || null,
    [items, selectedFailureId]
  )

  const parsedDetails = useMemo(() => {
    if (!selected?.detailsJson) return {}
    try {
      return JSON.parse(selected.detailsJson) as Record<string, unknown>
    } catch {
      return { raw: selected.detailsJson }
    }
  }, [selected?.detailsJson])

  const requestBody = useMemo(() => {
    const llmDetails = parsedDetails.llmDetails as Record<string, unknown> | undefined
    return llmDetails?.requestBody ?? null
  }, [parsedDetails])

  const responseBody = useMemo(() => {
    const llmDetails = parsedDetails.llmDetails as Record<string, unknown> | undefined
    return llmDetails?.responseBody ?? parsedDetails.providerError ?? parsedDetails.response ?? null
  }, [parsedDetails])

  const pretty = (value: unknown): string => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
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

      <div className={styles.grid}>
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
            <div>{t('llmFailures.time')}</div>
            <div>{t('llmFailures.provider')}</div>
            <div>{t('llmFailures.trigger')}</div>
            <div>{t('llmFailures.error')}</div>
          </div>
          {items.map((item) => {
            const time = new Date(item.createdAt)
            const timeLabel = Number.isNaN(time.getTime())
              ? item.createdAt
              : new Intl.DateTimeFormat(locale, {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }).format(time)

            return (
              <button key={item.id} type="button" className={`${styles.row} ${selectedFailureId === item.id ? styles.rowActive : ''}`} onClick={() => setSelectedFailureId(item.id)}>
                <div className={styles.cellMono}>{timeLabel}</div>
                <div>
                  <div className={styles.cellStrong}>{item.provider}</div>
                  <div className={styles.cellSub}>{item.component}</div>
                </div>
                <div>
                  <div className={styles.cellStrong}>{item.trigger}</div>
                  <div className={styles.cellSub}>
                    {item.model || '-'}
                    {item.attempt ? ` · attempt ${item.attempt}` : ''}
                    {typeof item.durationMs === 'number' ? ` · ${item.durationMs}ms` : ''}
                  </div>
                </div>
                <div>
                  <div className={styles.cellStrong}>{item.errorName}</div>
                  <div className={styles.cellSub}>{item.errorMessage}</div>
                </div>
              </button>
            )
          })}
          {!isLoading && items.length === 0 ? (
            <p className={styles.status}>{t('llmFailures.empty')}</p>
          ) : null}
        </div>
      </section>
      <section className={styles.section}>
        {!selected ? (
          <p className={styles.status}>{t('llmFailures.select')}</p>
        ) : (
          <div className={styles.detailWrap}>
            <h2 className={styles.detailTitle}>{t('llmFailures.detail')}</h2>
            <div className={styles.detailMeta}>
              <span>ID: {selected.id}</span>
              <span>provider: {selected.provider}</span>
              <span>trigger: {selected.trigger}</span>
              <span>model: {selected.model || '-'}</span>
              <span>query_id: {selected.queryId ?? '-'}</span>
              <span>intent_id: {selected.intentId ?? '-'}</span>
              <span>order_id: {selected.orderId ?? '-'}</span>
              <span>call_id: {selected.callId ?? '-'}</span>
            </div>
            <div className={styles.detailBlocks}>
              <section className={styles.detailBlock}>
                <h3 className={styles.detailBlockTitle}>{t('llmFailures.requestBody')}</h3>
                <pre className={styles.detailCode}>{pretty(requestBody)}</pre>
              </section>
              <section className={styles.detailBlock}>
                <h3 className={styles.detailBlockTitle}>{t('llmFailures.responseBody')}</h3>
                <pre className={styles.detailCode}>{pretty(responseBody)}</pre>
              </section>
            </div>
            <section className={styles.detailBlockFull}>
              <h3 className={styles.detailBlockTitle}>{t('llmFailures.rawDetails')}</h3>
              <pre className={styles.detailCode}>{pretty(parsedDetails)}</pre>
            </section>
          </div>
        )}
      </section>
      </div>
    </div>
  )
}
