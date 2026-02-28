export type ApiQueryRecord = {
  id: number
  value: string
  language: string
  originalValue: string | null
  createdAt: string
}

export type ApiArticleSummary = {
  id: number
  title: string
  slug: string
  filetype: string
  summary: string
  createdAt: string
}

export type ApiQueryIntent = {
  id: number
  intent: string
  filetype: string
  articles: ApiArticleSummary[]
}

export type ApiQueryResult = {
  query: ApiQueryRecord
  intents: ApiQueryIntent[]
}

export type ApiSearchSuggestionItem = {
  value: string
  language: string
  lastSearchedAt: string
}

export type ApiSearchSuggestionsPayload = {
  examples: string[]
  recent: ApiSearchSuggestionItem[]
  isFirstTimeUser: boolean
}

export type ArticleGenerationEtaPayload = {
  enabled: boolean
  action: 'preview' | 'content'
  sampleSize: number
  sampleCount: number
  averageDurationMs: number | null
}

export type ApiArticleDetail = {
  article: {
    id: number
    intentId: number | null
    title: string
    slug: string
    filetype: string
    summary: string
    content: string | null
    status: 'preview_ready' | 'content_generating' | 'content_ready' | 'content_failed'
    contentErrorMessage: string | null
    contentUpdatedAt: string | null
    generatedBy: string | null
    createdAt: string
  }
  intent?: {
    id: number
    queryId: number
    intent: string
    filetype: string
  }
  query?: ApiQueryRecord
  recommendedArticles: Array<{
    id: number
    title: string
    slug: string
    filetype: string
    summary: string
    status: 'preview_ready' | 'content_generating' | 'content_ready' | 'content_failed'
    createdAt: string
  }>
  activeOrderId?: number | null
}

export type GenerationOrderKind = 'query_full' | 'intent_regen' | 'article_regen_keep_title' | 'article_content_generate'

export type SearchStreamEvent =
  | {
      type: 'order.started'
      orderId: number
      queryId: number
      kind: GenerationOrderKind
      intentId?: number
    }
  | {
      type: 'order.progress'
      orderId: number
      queryId: number
      stage: 'spell' | 'intent' | 'article'
      message: string
    }
  | {
      type: 'intent.upserted'
      orderId: number
      queryId: number
      intent: {
        id: number
        value: string
      }
    }
  | {
      type: 'article.upserted'
      orderId: number
      queryId: number
      intentId: number
      article: {
        id: number
        title: string
        slug: string
        summary: string
      }
    }
  | {
      type: 'order.completed'
      orderId: number
      queryId: number
    }
  | {
      type: 'order.failed'
      orderId: number
      queryId: number
      message: string
    }

export type ApiErrorPayload = {
  error?: string
  code?: string
  activeOrderId?: number
  scope?: 'query' | 'intent'
  [key: string]: unknown
}

export class ApiError extends Error {
  status: number
  payload: ApiErrorPayload | null

  constructor(args: { status: number; message: string; payload: ApiErrorPayload | null }) {
    super(args.message)
    this.name = 'ApiError'
    this.status = args.status
    this.payload = args.payload
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const rawText = await response.text()
  const payload = (() => {
    if (!rawText) return null
    try {
      return JSON.parse(rawText) as ApiErrorPayload
    } catch {
      return null
    }
  })()

  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      rawText ||
      `Request failed: ${response.status}`
    throw new ApiError({
      status: response.status,
      message,
      payload,
    })
  }

  if (!rawText) {
    return {} as T
  }
  return JSON.parse(rawText) as T
}

export function isResourceLockedError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.payload?.code === 'RESOURCE_LOCKED' &&
    typeof error.payload?.activeOrderId === 'number'
  )
}

export type CreateQueryResponse = {
  queryId: number
  query: string
  originalQuery: string
  correctionApplied: boolean
  correctedQuery: string | null
  language: string
  spellCorrectionMode: 'off' | 'auto' | 'force'
}

export async function createQuery(args: {
  query: string
  language: string
  spellCorrectionMode?: 'off' | 'auto' | 'force'
  forceRegenerate?: boolean
}): Promise<CreateQueryResponse> {
  return apiFetch<CreateQueryResponse>('/query', {
    method: 'POST',
    body: JSON.stringify({
      query: args.query,
      language: args.language,
      spellCorrectionMode: args.spellCorrectionMode,
      forceRegenerate: args.forceRegenerate === true,
    }),
  })
}

export type CreateOrderResponse = {
  orderId: number
  queryId: number
  kind: GenerationOrderKind
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
}

export async function createOrder(args: {
  kind: GenerationOrderKind
  queryId: number
  intentId?: number
  articleId?: number
}): Promise<CreateOrderResponse> {
  return apiFetch<CreateOrderResponse>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      kind: args.kind,
      queryId: args.queryId,
      intentId: args.intentId,
      articleId: args.articleId,
    }),
  })
}

export type OrderAvailabilityResponse = {
  available: boolean
  reason: 'ok' | 'locked'
  activeOrderId?: number
  scope: 'query' | 'intent'
}

export async function getOrderAvailability(args: {
  kind: GenerationOrderKind
  queryId: number
  intentId?: number
}): Promise<OrderAvailabilityResponse> {
  const params = new URLSearchParams()
  params.set('kind', args.kind)
  params.set('queryId', String(args.queryId))
  if (typeof args.intentId === 'number') {
    params.set('intentId', String(args.intentId))
  }
  return apiFetch<OrderAvailabilityResponse>(`/orders/availability?${params.toString()}`)
}

export async function getQueryResult(queryId: number): Promise<ApiQueryResult> {
  return apiFetch<ApiQueryResult>(`/article?queryId=${queryId}`)
}

export async function getArticleBySlug(slug: string): Promise<ApiArticleDetail> {
  return apiFetch<ApiArticleDetail>(`/article/${encodeURIComponent(slug)}`)
}

export async function getSearchSuggestions(args?: {
  recentLimit?: number
  language?: string
}): Promise<ApiSearchSuggestionsPayload> {
  const params = new URLSearchParams()
  if (args?.recentLimit && Number.isInteger(args.recentLimit) && args.recentLimit > 0) {
    params.set('recentLimit', String(args.recentLimit))
  }
  if (args?.language) {
    params.set('language', args.language)
  }
  const query = params.toString()
  return apiFetch<ApiSearchSuggestionsPayload>(`/search/suggestions${query ? `?${query}` : ''}`)
}

export async function getArticleGenerationEta(): Promise<ArticleGenerationEtaPayload> {
  return apiFetch<ArticleGenerationEtaPayload>('/search/eta?action=content')
}

export async function getGenerationEtaByAction(action: 'preview' | 'content'): Promise<ArticleGenerationEtaPayload> {
  return apiFetch<ArticleGenerationEtaPayload>(`/search/eta?action=${action}`)
}

export function streamOrder(args: {
  orderId: number
  onEvent: (event: SearchStreamEvent) => void
  onError: (error: Error) => void
}): () => void {
  const source = new EventSource(`${API_BASE}/orders/${args.orderId}/stream`)

  const handleEvent = (event: MessageEvent) => {
    const parsed = JSON.parse(event.data) as SearchStreamEvent
    args.onEvent(parsed)
    if (parsed.type === 'order.completed' || parsed.type === 'order.failed') {
      source.close()
    }
  }

  source.addEventListener('order.started', handleEvent as EventListener)
  source.addEventListener('order.progress', handleEvent as EventListener)
  source.addEventListener('intent.upserted', handleEvent as EventListener)
  source.addEventListener('article.upserted', handleEvent as EventListener)
  source.addEventListener('order.completed', handleEvent as EventListener)
  source.addEventListener('order.failed', handleEvent as EventListener)

  source.onerror = () => {
    args.onError(new Error('SSE connection failed'))
    source.close()
  }

  return () => {
    source.close()
  }
}
