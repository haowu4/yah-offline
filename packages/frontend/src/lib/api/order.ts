export type ApiGenerationOrder = {
  id: number
  queryId: number
  kind: 'query_full' | 'intent_regen' | 'article_regen_keep_title'
  intentId: number | null
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  requestedBy: 'user' | 'system'
  requestPayloadJson: string
  resultSummaryJson: string | null
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
  query: {
    id: number
    value: string
    language: string
  } | null
  intent: {
    id: number
    value: string
  } | null
}

export type ApiGenerationOrderLog = {
  id: number
  orderId: number
  stage: 'order' | 'spell' | 'intent' | 'article'
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  metaJson: string
  createdAt: string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export async function listGenerationOrders(args?: {
  limit?: number
  status?: ApiGenerationOrder['status']
  kind?: ApiGenerationOrder['kind']
}): Promise<{ orders: ApiGenerationOrder[] }> {
  const params = new URLSearchParams()
  if (args?.limit && Number.isInteger(args.limit) && args.limit > 0) {
    params.set('limit', String(args.limit))
  }
  if (args?.status) params.set('status', args.status)
  if (args?.kind) params.set('kind', args.kind)
  const query = params.toString()
  return apiFetch<{ orders: ApiGenerationOrder[] }>(`/orders${query ? `?${query}` : ''}`)
}

export async function getGenerationOrderLogs(orderId: number): Promise<{ logs: ApiGenerationOrderLog[] }> {
  return apiFetch<{ logs: ApiGenerationOrderLog[] }>(`/orders/${orderId}/logs`)
}
