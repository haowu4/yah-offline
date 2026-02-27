import { useEffect, useMemo, useState } from 'react'
import { getGenerationOrderLogs, listGenerationOrders, type ApiGenerationOrder, type ApiGenerationOrderLog } from '../lib/api/order'
import { useI18n } from '../i18n/useI18n'
import styles from './OrderLogsPage.module.css'

export function OrderLogsPage() {
  const { t, locale } = useI18n()
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orders, setOrders] = useState<ApiGenerationOrder[]>([])
  const [selectedOrder, setSelectedOrder] = useState<ApiGenerationOrder | null>(null)
  const [logs, setLogs] = useState<ApiGenerationOrderLog[]>([])
  const [statusFilter, setStatusFilter] = useState<ApiGenerationOrder['status'] | ''>('')
  const [kindFilter, setKindFilter] = useState<ApiGenerationOrder['kind'] | ''>('')

  const loadOrders = async () => {
    setIsLoading(true)
    try {
      const payload = await listGenerationOrders({
        limit: 200,
        status: statusFilter || undefined,
        kind: kindFilter || undefined,
      })
      setOrders(payload.orders)
      setError(null)

      if (payload.orders.length === 0) {
        setSelectedOrder(null)
        setLogs([])
      } else if (!selectedOrder || !payload.orders.some((order) => order.id === selectedOrder.id)) {
        setSelectedOrder(payload.orders[0])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('orderLogs.error.load'))
    } finally {
      setIsLoading(false)
    }
  }

  const loadLogs = async (orderId: number) => {
    setIsLoadingLogs(true)
    try {
      const payload = await getGenerationOrderLogs(orderId)
      setLogs(payload.logs)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('orderLogs.error.loadLogs'))
    } finally {
      setIsLoadingLogs(false)
    }
  }

  useEffect(() => {
    document.title = t('orderLogs.page.title')
  }, [t])

  useEffect(() => {
    void loadOrders()
  }, [statusFilter, kindFilter])

  useEffect(() => {
    if (!selectedOrder) return
    void loadLogs(selectedOrder.id)
  }, [selectedOrder?.id])

  const orderStatus = useMemo(() => {
    if (!selectedOrder) return ''
    return `${selectedOrder.status} · ${selectedOrder.kind}`
  }, [selectedOrder])

  const formatJsonBlock = (value: string | null) => {
    if (!value) return '-'
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }

  const durationLabel = useMemo(() => {
    if (!selectedOrder?.startedAt || !selectedOrder?.finishedAt) return '-'
    const started = new Date(selectedOrder.startedAt).getTime()
    const finished = new Date(selectedOrder.finishedAt).getTime()
    if (!Number.isFinite(started) || !Number.isFinite(finished)) return '-'
    const durationMs = Math.max(0, finished - started)
    return `${durationMs}ms`
  }, [selectedOrder?.finishedAt, selectedOrder?.startedAt])

  const formatTime = (value: string | null) => {
    if (!value) return '-'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(parsed)
  }

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

      <div className={styles.grid}>
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
              </select>
            </label>
          </div>
          <div className={styles.orderList}>
            {orders.map((order) => (
              <button
                key={order.id}
                type="button"
                className={`${styles.orderItem} ${selectedOrder?.id === order.id ? styles.orderItemActive : ''}`}
                onClick={() => setSelectedOrder(order)}
              >
                <div className={styles.orderItemTop}>
                  <strong>#{order.id}</strong>
                  <span className={styles.badge}>{order.status}</span>
                </div>
                <div className={styles.orderItemSub}>{order.kind}</div>
                <div className={styles.orderItemSub}>
                  query: {order.query?.value || `#${order.queryId}`}
                </div>
                <div className={styles.orderItemSub}>
                  intent: {order.intent?.value || (order.intentId ? `#${order.intentId}` : '-')}
                </div>
                <div className={styles.orderItemSub}>{formatTime(order.createdAt)}</div>
              </button>
            ))}
            {!isLoading && orders.length === 0 ? <p className={styles.status}>{t('orderLogs.empty')}</p> : null}
          </div>
        </section>

        <section className={styles.section}>
          {!selectedOrder ? (
            <p className={styles.status}>{t('orderLogs.select')}</p>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>{t('orderLogs.order', { id: String(selectedOrder.id) })}</h2>
                <span className={styles.detailMeta}>{orderStatus}</span>
              </div>
              <div className={styles.detailMetaList}>
                <span>{t('orderLogs.requestedBy')}: {selectedOrder.requestedBy}</span>
                <span>{t('orderLogs.queryId')}: {selectedOrder.queryId}</span>
                <span>{t('orderLogs.query')}: {selectedOrder.query?.value || '-'}</span>
                <span>{t('orderLogs.intentId')}: {selectedOrder.intentId ?? '-'}</span>
                <span>{t('orderLogs.intent')}: {selectedOrder.intent?.value || '-'}</span>
                <span>{t('orderLogs.created')}: {formatTime(selectedOrder.createdAt)}</span>
                <span>{t('orderLogs.started')}: {formatTime(selectedOrder.startedAt)}</span>
                <span>{t('orderLogs.finished')}: {formatTime(selectedOrder.finishedAt)}</span>
                <span>{t('orderLogs.updated')}: {formatTime(selectedOrder.updatedAt)}</span>
                <span>{t('orderLogs.duration')}: {durationLabel}</span>
                {selectedOrder.errorMessage ? <span>{t('orderLogs.error')}: {selectedOrder.errorMessage}</span> : null}
              </div>
              <div className={styles.detailBlocks}>
                <section className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>{t('orderLogs.requestPayload')}</h3>
                  <pre className={styles.detailCode}>{formatJsonBlock(selectedOrder.requestPayloadJson)}</pre>
                </section>
                <section className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>{t('orderLogs.resultSummary')}</h3>
                  <pre className={styles.detailCode}>{formatJsonBlock(selectedOrder.resultSummaryJson)}</pre>
                </section>
              </div>
              {isLoadingLogs ? <p className={styles.status}>{t('orderLogs.loadingLogs')}</p> : null}
              <div className={styles.logList}>
                {logs.map((log) => (
                  <div key={log.id} className={styles.logItem}>
                    <span className={styles.logTime}>{formatTime(log.createdAt)}</span>
                    <span className={styles.logLevel}>{log.level}</span>
                    <span className={styles.logStage}>{log.stage}</span>
                    <span className={styles.logMessage}>{log.message}</span>
                  </div>
                ))}
                {!isLoadingLogs && logs.length === 0 ? <p className={styles.status}>{t('orderLogs.noLogs')}</p> : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
