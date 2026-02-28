const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export type ApiArticleGenerationRun = {
  id: number
  queryId: number
  intentId: number | null
  articleId: number | null
  orderId: number
  kind: 'preview' | 'content'
  status: 'running' | 'completed' | 'failed'
  attempts: number | null
  durationMs: number | null
  llmDurationMs: number | null
  errorMessage: string | null
  startedAt: string
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export async function listArticleGenerationRuns(args?: {
  limit?: number
  offset?: number
  status?: ApiArticleGenerationRun['status']
  kind?: ApiArticleGenerationRun['kind']
}): Promise<{
  pagination: { limit: number; offset: number; total: number }
  runs: ApiArticleGenerationRun[]
}> {
  const params = new URLSearchParams()
  if (args?.limit && Number.isInteger(args.limit) && args.limit > 0) {
    params.set('limit', String(args.limit))
  }
  if (args?.offset && Number.isInteger(args.offset) && args.offset >= 0) {
    params.set('offset', String(args.offset))
  }
  if (args?.status) {
    params.set('status', args.status)
  }
  if (args?.kind) {
    params.set('kind', args.kind)
  }
  const query = params.toString()
  return apiFetch(`/article-generation-runs${query ? `?${query}` : ''}`)
}
