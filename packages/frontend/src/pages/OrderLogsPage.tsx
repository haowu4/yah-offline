import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiChevronDown, FiChevronRight } from 'react-icons/fi'
import { getGenerationOrderLogs, listGenerationOrders, type ApiGenerationOrder, type ApiGenerationOrderLog } from '../lib/api/order'
import { useI18n } from '../i18n/useI18n'
import styles from './OrderLogsPage.module.css'

const PAGE_SIZE = 30

export function OrderLogsPage() {
  const { t, locale } = useI18n()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orders, setOrders] = useState<ApiGenerationOrder[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [logsByOrderId, setLogsByOrderId] = useState<Record<number, ApiGenerationOrderLog[]>>({})
  const [loadingLogOrderIds, setLoadingLogOrderIds] = useState<Record<number, boolean>>({})
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<number, boolean>>({})
  const [statusFilter, setStatusFilter] = useState<ApiGenerationOrder['status'] | ''>('')
  const [kindFilter, setKindFilter] = useState<ApiGenerationOrder['kind'] | ''>('')

  const loadOrders = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent)
    if (!silent) setIsLoading(true)
    try {
      const payload = await listGenerationOrders({
        limit: PAGE_SIZE,
        offset,
        status: statusFilter || undefined,
        kind: kindFilter || undefined,
      })
      setOrders(payload.orders)
      setTotal(payload.pagination.total)
      setError(null)
      if (payload.orders.length === 0) {
        setExpandedOrderIds({})
      } else {
        const allowed = new Set(payload.orders.map((order) => order.id))
        setExpandedOrderIds((prev) => {
          const next: Record<number, boolean> = {}
          for (const key of Object.keys(prev)) {
            const orderId = Number(key)
            if (allowed.has(orderId)) next[orderId] = true
          }
          return next
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('orderLogs.error.load'))
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [kindFilter, offset, statusFilter, t])

  useEffect(() => {
    document.title = t('orderLogs.page.title')
  }, [t])

  useEffect(() => {
    setOffset(0)
  }, [statusFilter, kindFilter])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadOrders({ silent: true })
    }, 2000)
    return () => window.clearInterval(timer)
  }, [loadOrders])

  const formatTime = (value: string | null) => {
    if (!value) return '-'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(parsed)
  }

  const formatJsonBlock = (value: string | null) => {
    if (!value) return '-'
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }

  const loadLogsForOrder = async (orderId: number) => {
    if (logsByOrderId[orderId]) return

    setLoadingLogOrderIds((prev) => ({ ...prev, [orderId]: true }))
    try {
      const payload = await getGenerationOrderLogs(orderId)
      setLogsByOrderId((prev) => ({ ...prev, [orderId]: payload.logs }))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('orderLogs.error.loadLogs'))
    } finally {
      setLoadingLogOrderIds((prev) => ({ ...prev, [orderId]: false }))
    }
  }

  const toggleExpand = async (order: ApiGenerationOrder) => {
    setExpandedOrderIds((prev) => ({ ...prev, [order.id]: !prev[order.id] }))
    await loadLogsForOrder(order.id)
  }

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      setError('Failed to copy')
    }
  }

  const durationLabel = (order: ApiGenerationOrder) => {
    if (!order.startedAt || !order.finishedAt) return '-'
    const started = new Date(order.startedAt).getTime()
    const finished = new Date(order.finishedAt).getTime()
    if (!Number.isFinite(started) || !Number.isFinite(finished)) return '-'
    return `${Math.max(0, finished - started)}ms`
  }

  const visibleRows = useMemo(() => orders, [orders])

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('orderLogs.title')}</h1>
        <button type="button" className={styles.button} onClick={() => void loadOrders()}>
          {t('orderLogs.refresh')}
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {isLoading ? <p className={styles.status}>{t('orderLogs.loading')}</p> : null}

      <section className={styles.section}>
        <div className={styles.controls}>
          <label className={styles.field}>
            <span>{t('orderLogs.status')}</span>
            <select className={styles.select} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ApiGenerationOrder['status'] | '')}>
              <option value="">{t('orderLogs.all')}</option>
              <option value="queued">queued</option>
              <option value="running">running</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>{t('orderLogs.kind')}</span>
            <select className={styles.select} value={kindFilter} onChange={(event) => setKindFilter(event.target.value as ApiGenerationOrder['kind'] | '')}>
              <option value="">{t('orderLogs.all')}</option>
              <option value="query_full">query_full</option>
              <option value="intent_regen">intent_regen</option>
              <option value="article_regen_keep_title">article_regen_keep_title</option>
              <option value="article_content_generate">article_content_generate</option>
            </select>
          </label>
        </div>

        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <div></div>
            <div>ID</div>
            <div>{t('orderLogs.status')}</div>
            <div>{t('orderLogs.kind')}</div>
            <div>{t('orderLogs.query')}</div>
            <div>{t('orderLogs.intent')}</div>
            <div>{t('orderLogs.created')}</div>
          </div>

          {visibleRows.map((order) => {
            const isExpanded = Boolean(expandedOrderIds[order.id])
            const logs = logsByOrderId[order.id] || []
            const isLoadingLogs = Boolean(loadingLogOrderIds[order.id])

            return (
              <div key={order.id} className={styles.rowGroup}>
                <button
                  type="button"
                  className={`${styles.row} ${isExpanded ? styles.rowExpanded : ''}`}
                  onClick={() => void toggleExpand(order)}
                >
                  <span className={styles.expandIcon}>{isExpanded ? <FiChevronDown /> : <FiChevronRight />}</span>
                  <span className={styles.mono}>#{order.id}</span>
                  <span><span className={styles.badge}>{order.status}</span></span>
                  <span>{order.kind}</span>
                  <span title={order.query?.value || ''}>{order.query?.value || `#${order.queryId}`}</span>
                  <span title={order.intent?.value || ''}>{order.intent?.value || (order.intentId ? `#${order.intentId}` : '-')}</span>
                  <span className={styles.mono}>{formatTime(order.createdAt)}</span>
                </button>

                {isExpanded ? (
                  <div className={styles.expandedRow}>
                    <div className={styles.metaGrid}>
                      <span>{t('orderLogs.requestedBy')}: {order.requestedBy}</span>
                      <span>{t('orderLogs.queryId')}: {order.queryId}</span>
                      <span>{t('orderLogs.intentId')}: {order.intentId ?? '-'}</span>
                      <span>{t('orderLogs.started')}: {formatTime(order.startedAt)}</span>
                      <span>{t('orderLogs.finished')}: {formatTime(order.finishedAt)}</span>
                      <span>{t('orderLogs.updated')}: {formatTime(order.updatedAt)}</span>
                      <span>{t('orderLogs.duration')}: {durationLabel(order)}</span>
                      {order.errorMessage ? <span>{t('orderLogs.error')}: {order.errorMessage}</span> : null}
                    </div>

                    <div className={styles.detailBlocks}>
                      <section className={styles.detailBlock}>
                        <h3 className={styles.detailBlockTitle}>
                          {t('orderLogs.requestPayload')}
                          <button type="button" className={styles.copyButton} onClick={() => void copyText(formatJsonBlock(order.requestPayloadJson))}>Copy</button>
                        </h3>
                        <pre className={styles.detailCode}>{formatJsonBlock(order.requestPayloadJson)}</pre>
                      </section>
                      <section className={styles.detailBlock}>
                        <h3 className={styles.detailBlockTitle}>
                          {t('orderLogs.resultSummary')}
                          <button type="button" className={styles.copyButton} onClick={() => void copyText(formatJsonBlock(order.resultSummaryJson))}>Copy</button>
                        </h3>
                        <pre className={styles.detailCode}>{formatJsonBlock(order.resultSummaryJson)}</pre>
                      </section>
                    </div>

                    <section className={styles.logBlock}>
                      <h3 className={styles.detailBlockTitle}>{t('orderLogs.title')}</h3>
                      {isLoadingLogs ? <p className={styles.status}>{t('orderLogs.loadingLogs')}</p> : null}
                      {!isLoadingLogs && logs.length === 0 ? <p className={styles.status}>{t('orderLogs.noLogs')}</p> : null}
                      {logs.length > 0 ? (
                        <div className={styles.logsTable}>
                          {logs.map((log) => (
                            <div key={log.id} className={styles.logRow}>
                              <span className={styles.mono}>{formatTime(log.createdAt)}</span>
                              <span className={styles.logLevel}>{log.level}</span>
                              <span>{log.stage}</span>
                              <span>{log.message}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  </div>
                ) : null}
              </div>
            )
          })}

          {!isLoading && visibleRows.length === 0 ? (
            <p className={styles.status}>{t('orderLogs.empty')}</p>
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
