import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { createQuery, rerunArticleForIntent, rerunIntents, streamQuery } from '../lib/api/search'
import type { SearchStreamEvent } from '../lib/api/search'
import styles from './SearchCtx.module.css'

export type SearchArticle = {
  id: number
  title: string
  slug: string
  snippet: string
}

export type SearchIntent = {
  id: number
  intent: string
  articles: SearchArticle[]
  isLoading: boolean
}

export type SearchState = {
  queryId: number | null
  query: string
  requestedQuery: string
  correctionApplied: boolean
  correctedQuery: string | null
  language: string
  spellCorrectionMode: 'off' | 'auto' | 'force'
  queryIntents: SearchIntent[]
  isLoading: boolean
  error: string | null
  isReplayed: boolean
}

type SearchContextValue = SearchState & {
  startSearch: (args: {
    query: string
    language?: string
    spellCorrectionMode?: 'off' | 'auto' | 'force'
  }) => Promise<void>
  hydrateFromResult: (args: {
    queryId: number
    query: string
    language?: string
    intents: Array<{
      id: number
      intent: string
      articles: Array<{ id: number; title: string; slug: string; snippet: string }>
    }>
  }) => void
  rerunIntentResolve: () => Promise<void>
  rerunArticleGenerationForIntent: (intentId: number) => Promise<void>
  reset: () => void
}

const SearchCtx = createContext<SearchContextValue | null>(null)

function resolveSearchLanguage(language: string | undefined): string {
  const raw = language?.trim() || 'auto'
  if (raw && raw.toLowerCase() !== 'auto') return raw

  const browserLanguage =
    typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      ? navigator.language.trim()
      : ''
  if (browserLanguage) return browserLanguage
  return 'en'
}

function applyStreamEvent(state: SearchState, event: SearchStreamEvent): SearchState {
  if (event.type === 'intent.created') {
    const alreadyExists = state.queryIntents.some((intent) => intent.id === event.intent.id)
    if (alreadyExists) {
      return state
    }

    return {
      ...state,
      queryIntents: [
        ...state.queryIntents,
        {
          id: event.intent.id,
          intent: event.intent.value,
          articles: [],
          isLoading: true,
        },
      ],
    }
  }

  if (event.type === 'article.created') {
    if (event.intentId === undefined) {
      return state
    }

    return {
      ...state,
      queryIntents: state.queryIntents.map((intent) => {
        if (intent.id !== event.intentId) return intent
        const exists = intent.articles.some((article) => article.id === event.article.id)
        if (exists) {
          return {
            ...intent,
            isLoading: false,
            articles: intent.articles.map((article) =>
              article.id === event.article.id ? event.article : article
            ),
          }
        }

        return {
          ...intent,
          isLoading: false,
          articles: [...intent.articles, event.article],
        }
      }),
    }
  }

  if (event.type === 'query.completed') {
    return {
      ...state,
      isLoading: false,
      error: null,
      isReplayed: event.replayed,
      queryIntents: state.queryIntents.map((intent) => ({
        ...intent,
        isLoading: false,
      })),
    }
  }

  if (event.type === 'query.error') {
    return {
      ...state,
      isLoading: false,
      error: event.message,
      queryIntents: state.queryIntents.map((intent) => ({
        ...intent,
        isLoading: false,
      })),
    }
  }

  return state
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SearchState>({
    queryId: null,
    query: '',
    requestedQuery: '',
    correctionApplied: false,
    correctedQuery: null,
    language: 'auto',
    spellCorrectionMode: 'auto',
    queryIntents: [],
    isLoading: false,
    error: null,
    isReplayed: false,
  })
  const teardownRef = useRef<(() => void) | null>(null)
  const requestIdRef = useRef(0)

  const beginStream = useCallback((queryId: number, requestId: number) => {
    teardownRef.current = streamQuery({
      queryId,
      onEvent: (event) => {
        if (requestIdRef.current !== requestId) return
        setState((prev) => applyStreamEvent(prev, event))
      },
      onError: (error) => {
        if (requestIdRef.current !== requestId) return
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message,
          queryIntents: prev.queryIntents.map((intent) => ({
            ...intent,
            isLoading: false,
          })),
        }))
      },
    })
  }, [])

  const reset = useCallback(() => {
    requestIdRef.current += 1
    teardownRef.current?.()
    teardownRef.current = null
    setState({
      queryId: null,
      query: '',
      requestedQuery: '',
      correctionApplied: false,
      correctedQuery: null,
      language: 'auto',
      spellCorrectionMode: 'auto',
      queryIntents: [],
      isLoading: false,
      error: null,
      isReplayed: false,
    })
  }, [])

  const hydrateFromResult = useCallback(
    (args: {
      queryId: number
      query: string
      language?: string
      intents: Array<{
        id: number
        intent: string
        articles: Array<{ id: number; title: string; slug: string; snippet: string }>
      }>
    }) => {
      setState({
        queryId: args.queryId,
        query: args.query,
        requestedQuery: args.query,
        correctionApplied: false,
        correctedQuery: null,
        language: args.language || 'auto',
        spellCorrectionMode: 'auto',
        queryIntents: args.intents.map((intent) => ({
          id: intent.id,
          intent: intent.intent,
          articles: intent.articles,
          isLoading: false,
        })),
        isLoading: false,
        error: null,
        isReplayed: true,
      })
    },
    []
  )

  const startSearch = useCallback(async (args: {
    query: string
    language?: string
    spellCorrectionMode?: 'off' | 'auto' | 'force'
  }) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const queryValue = args.query.trim()
    if (!queryValue) return

    const requestedLanguage = args.language?.trim() || 'auto'
    const effectiveLanguage = resolveSearchLanguage(requestedLanguage)
    const spellCorrectionMode = args.spellCorrectionMode || 'auto'

    teardownRef.current?.()
    teardownRef.current = null

    setState({
      queryId: null,
      query: queryValue,
      requestedQuery: queryValue,
      correctionApplied: false,
      correctedQuery: null,
      language: requestedLanguage,
      spellCorrectionMode,
      queryIntents: [],
      isLoading: true,
      error: null,
      isReplayed: false,
    })

    const created = await createQuery({
      query: queryValue,
      language: effectiveLanguage,
      spellCorrectionMode,
    })
    if (requestIdRef.current !== requestId) {
      return
    }

    setState((prev) => ({
      ...prev,
      queryId: created.queryId,
      query: created.query,
      requestedQuery: created.originalQuery,
      correctionApplied: created.correctionApplied,
      correctedQuery: created.correctedQuery,
      language: created.language,
      spellCorrectionMode: created.spellCorrectionMode,
    }))

    beginStream(created.queryId, requestId)
  }, [beginStream])

  const rerunIntentResolve = useCallback(async () => {
    const queryId = state.queryId
    if (!queryId) return

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    teardownRef.current?.()
    teardownRef.current = null

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      isReplayed: false,
      queryIntents: [],
    }))

    await rerunIntents(queryId)
    if (requestIdRef.current !== requestId) return
    beginStream(queryId, requestId)
  }, [beginStream, state.queryId])

  const rerunArticleGenerationForIntent = useCallback(async (intentId: number) => {
    const queryId = state.queryId
    if (!queryId || !Number.isInteger(intentId) || intentId <= 0) return

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    teardownRef.current?.()
    teardownRef.current = null

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      isReplayed: false,
      queryIntents: prev.queryIntents.map((intent) => ({
        ...intent,
        isLoading: intent.id === intentId,
      })),
    }))

    await rerunArticleForIntent(queryId, intentId)
    if (requestIdRef.current !== requestId) return
    beginStream(queryId, requestId)
  }, [beginStream, state.queryId])

  const value = useMemo(
    () => ({
      ...state,
      startSearch,
      hydrateFromResult,
      rerunIntentResolve,
      rerunArticleGenerationForIntent,
      reset,
    }),
    [hydrateFromResult, rerunArticleGenerationForIntent, rerunIntentResolve, reset, startSearch, state]
  )

  return (
    <div className={styles.root}>
      <SearchCtx.Provider value={value}>{children}</SearchCtx.Provider>
    </div>
  )
}

export function useSearchCtx(): SearchContextValue {
  const ctx = useContext(SearchCtx)
  if (!ctx) {
    throw new Error('useSearchCtx must be used within SearchProvider')
  }
  return ctx
}
