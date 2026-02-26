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
  snippet: string
  createdAt: string
}

export type ApiQueryIntent = {
  id: number
  intent: string
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

export type ApiArticleDetail = {
  article: {
    id: number
    intentId: number | null
    title: string
    slug: string
    content: string
    createdAt: string
  }
  intent?: {
    id: number
    queryId: number
    intent: string
  }
  query?: ApiQueryRecord
  relatedIntents: Array<{
    id: number
    intent: string
  }>
}

export type SearchStreamEvent =
  | {
      type: 'intent.created'
      queryId: number
      intent: {
        id: number
        value: string
      }
    }
  | {
      type: 'article.created'
      queryId: number
      intentId?: number
      article: {
        id: number
        title: string
        slug: string
        snippet: string
      }
    }
  | {
      type: 'query.completed'
      queryId: number
      replayed: boolean
    }
  | {
      type: 'query.error'
      queryId: number
      message: string
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

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed: ${response.status}`)
  }

  return (await response.json()) as T
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
}): Promise<CreateQueryResponse> {
  return apiFetch<CreateQueryResponse>('/query', {
    method: 'POST',
    body: JSON.stringify({
      query: args.query,
      language: args.language,
      spellCorrectionMode: args.spellCorrectionMode,
    }),
  })
}

export type RerunQueryResponse = {
  queryId: number
  accepted: boolean
  mode: 'rerun-intents' | 'rerun-articles'
}

export async function rerunIntents(queryId: number): Promise<RerunQueryResponse> {
  return apiFetch<RerunQueryResponse>(`/query/${queryId}/rerun-intents`, {
    method: 'POST',
  })
}

export async function rerunArticles(queryId: number): Promise<RerunQueryResponse> {
  return apiFetch<RerunQueryResponse>(`/query/${queryId}/rerun-articles`, {
    method: 'POST',
  })
}

export type RerunIntentArticleResponse = RerunQueryResponse & {
  intentId: number
}

export async function rerunArticleForIntent(queryId: number, intentId: number): Promise<RerunIntentArticleResponse> {
  return apiFetch<RerunIntentArticleResponse>(`/query/${queryId}/intents/${intentId}/rerun-article`, {
    method: 'POST',
  })
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

export function streamQuery(args: {
  queryId: number
  onEvent: (event: SearchStreamEvent) => void
  onError: (error: Error) => void
}): () => void {
  const source = new EventSource(`${API_BASE}/query/${args.queryId}/stream`)

  const handleIntent = (event: MessageEvent) => {
    const parsed = JSON.parse(event.data) as SearchStreamEvent
    args.onEvent(parsed)
  }

  const handleArticle = (event: MessageEvent) => {
    const parsed = JSON.parse(event.data) as SearchStreamEvent
    args.onEvent(parsed)
  }

  const handleCompleted = (event: MessageEvent) => {
    const parsed = JSON.parse(event.data) as SearchStreamEvent
    args.onEvent(parsed)
    source.close()
  }

  const handleErrorEvent = (event: MessageEvent) => {
    const parsed = JSON.parse(event.data) as SearchStreamEvent
    args.onEvent(parsed)
    source.close()
  }

  source.addEventListener('intent.created', handleIntent as EventListener)
  source.addEventListener('article.created', handleArticle as EventListener)
  source.addEventListener('query.completed', handleCompleted as EventListener)
  source.addEventListener('query.error', handleErrorEvent as EventListener)

  source.onerror = () => {
    args.onError(new Error('SSE connection failed'))
    source.close()
  }

  return () => {
    source.close()
  }
}
