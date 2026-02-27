export type ApiLLMFailure = {
  id: number
  provider: string
  component: string
  trigger: string
  model: string | null
  queryId: number | null
  intentId: number | null
  orderId: number | null
  queryText: string | null
  intentText: string | null
  callId: string | null
  attempt: number | null
  durationMs: number | null
  errorName: string
  errorMessage: string
  detailsJson: string
  createdAt: string
}

export type ApiLLMFailuresResponse = {
  pagination: {
    limit: number
    offset: number
    total: number
  }
  failures: ApiLLMFailure[]
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

export async function listLLMFailures(args?: {
  limit?: number
  offset?: number
  provider?: string
  trigger?: string
  component?: string
}): Promise<ApiLLMFailuresResponse> {
  const params = new URLSearchParams()
  if (args?.limit && Number.isInteger(args.limit) && args.limit > 0) {
    params.set('limit', String(args.limit))
  }
  if (typeof args?.offset === 'number' && Number.isInteger(args.offset) && args.offset >= 0) {
    params.set('offset', String(args.offset))
  }
  if (args?.provider) params.set('provider', args.provider)
  if (args?.trigger) params.set('trigger', args.trigger)
  if (args?.component) params.set('component', args.component)

  const query = params.toString()
  return apiFetch<ApiLLMFailuresResponse>(`/llm/failures${query ? `?${query}` : ''}`)
}
