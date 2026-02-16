import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { createQuery, streamQuery } from '../lib/api/search'
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
  queryIntents: SearchIntent[]
  isLoading: boolean
  error: string | null
  isReplayed: boolean
}

type SearchContextValue = SearchState & {
  startSearch: (query: string) => Promise<void>
  hydrateFromResult: (args: {
    queryId: number
    query: string
    intents: Array<{
      id: number
      intent: string
      articles: Array<{ id: number; title: string; slug: string; snippet: string }>
    }>
  }) => void
  reset: () => void
}

const SearchCtx = createContext<SearchContextValue | null>(null)

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
    return {
      ...state,
      queryIntents: state.queryIntents.map((intent) => {
        if (intent.id !== event.intentId) return intent
        const exists = intent.articles.some((article) => article.id === event.article.id)
        if (exists) {
          return { ...intent, isLoading: false }
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
    queryIntents: [],
    isLoading: false,
    error: null,
    isReplayed: false,
  })
  const teardownRef = useRef<(() => void) | null>(null)
  const requestIdRef = useRef(0)

  const reset = useCallback(() => {
    requestIdRef.current += 1
    teardownRef.current?.()
    teardownRef.current = null
    setState({
      queryId: null,
      query: '',
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
      intents: Array<{
        id: number
        intent: string
        articles: Array<{ id: number; title: string; slug: string; snippet: string }>
      }>
    }) => {
      setState({
        queryId: args.queryId,
        query: args.query,
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

  const startSearch = useCallback(async (query: string) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const queryValue = query.trim()
    if (!queryValue) return

    teardownRef.current?.()
    teardownRef.current = null

    setState({
      queryId: null,
      query: queryValue,
      queryIntents: [],
      isLoading: true,
      error: null,
      isReplayed: false,
    })

    const { queryId } = await createQuery(queryValue)
    if (requestIdRef.current !== requestId) {
      return
    }

    setState((prev) => ({
      ...prev,
      queryId,
    }))

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

  const value = useMemo(
    () => ({
      ...state,
      startSearch,
      hydrateFromResult,
      reset,
    }),
    [hydrateFromResult, reset, startSearch, state]
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
