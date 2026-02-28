import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
} from 'react'
import type { ReactNode } from 'react'
import {
  createOrder,
  createQuery,
  getOrderAvailability,
  getQueryResult,
  isResourceLockedError,
  streamOrder,
} from '../lib/api/search'
import type { SearchStreamEvent } from '../lib/api/search'
import styles from './SearchCtx.module.css'

export type SearchArticle = {
  id: number
  title: string
  slug: string
  summary: string
}

export type SearchIntent = {
  id: number
  intent: string
  articles: SearchArticle[]
  isLoading: boolean
}

export type SearchDebugEvent = {
  at: string
  message: string
}

export type SearchState = {
  queryId: number | null
  activeOrderId: number | null
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
  debugEvents: SearchDebugEvent[]
}

type SearchContextValue = SearchState & {
  startSearch: (args: {
    query: string
    language?: string
    spellCorrectionMode?: 'off' | 'auto' | 'force'
    forceRegenerate?: boolean
  }) => Promise<void>
  hydrateFromResult: (args: {
    queryId: number
    query: string
    language?: string
    intents: Array<{
      id: number
      intent: string
      articles: Array<{ id: number; title: string; slug: string; summary: string }>
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

function appendDebugEvent(events: SearchDebugEvent[], message: string): SearchDebugEvent[] {
  const next = [...events, { at: new Date().toISOString(), message }]
  if (next.length <= 80) return next
  return next.slice(next.length - 80)
}

const initialState: SearchState = {
  queryId: null,
  activeOrderId: null,
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
  debugEvents: [],
}

type Action =
  | {
      type: 'SEARCH_INIT'
      payload: {
        query: string
        requestedLanguage: string
        spellCorrectionMode: 'off' | 'auto' | 'force'
      }
    }
  | {
      type: 'SEARCH_CREATED'
      payload: {
        queryId: number
        query: string
        requestedQuery: string
        correctionApplied: boolean
        correctedQuery: string | null
        language: string
        spellCorrectionMode: 'off' | 'auto' | 'force'
      }
    }
  | {
      type: 'SEARCH_READY'
      payload: {
        intents: SearchIntent[]
        isLoading: boolean
        isReplayed: boolean
      }
    }
  | {
      type: 'QUERY_ORDER_ATTACHED'
      payload: {
        orderId: number
        message: string
      }
    }
  | {
      type: 'QUERY_STREAM_EVENT'
      payload: SearchStreamEvent
    }
  | {
      type: 'QUERY_STREAM_ERROR'
      payload: {
        message: string
      }
    }
  | {
      type: 'RERUN_INTENTS_INIT'
    }
  | {
      type: 'INTENT_REGEN_INIT'
      payload: {
        intentId: number
      }
    }
  | {
      type: 'INTENT_REGEN_ORDER_EVENT'
      payload: {
        intentId: number
        event: SearchStreamEvent
      }
    }
  | {
      type: 'INTENT_REGEN_STREAM_ERROR'
      payload: {
        intentId: number
        message: string
      }
    }
  | {
      type: 'HYDRATE_FROM_RESULT'
      payload: {
        queryId: number
        query: string
        language: string
        intents: SearchIntent[]
      }
    }
  | {
      type: 'RESET'
    }

function applyQueryOrderStreamEvent(state: SearchState, event: SearchStreamEvent): SearchState {
  if (event.type === 'order.started') {
    return {
      ...state,
      isLoading: true,
      error: null,
      activeOrderId: event.orderId,
      debugEvents: appendDebugEvent(state.debugEvents, `order.started #${event.orderId} kind=${event.kind}`),
    }
  }

  if (event.type === 'order.progress') {
    return {
      ...state,
      debugEvents: appendDebugEvent(state.debugEvents, `order.progress #${event.orderId} ${event.stage}: ${event.message}`),
    }
  }

  if (event.type === 'intent.upserted') {
    const alreadyExists = state.queryIntents.some((intent) => intent.id === event.intent.id)
    if (alreadyExists) {
      return {
        ...state,
        debugEvents: appendDebugEvent(state.debugEvents, `intent.upserted #${event.orderId} intent=${event.intent.id}`),
      }
    }

    return {
      ...state,
      debugEvents: appendDebugEvent(state.debugEvents, `intent.upserted #${event.orderId} intent=${event.intent.id}`),
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

  if (event.type === 'article.upserted') {
    return {
      ...state,
      debugEvents: appendDebugEvent(state.debugEvents, `article.upserted #${event.orderId} intent=${event.intentId} article=${event.article.id}`),
      queryIntents: state.queryIntents.map((intent) => {
        if (intent.id !== event.intentId) return intent
        const exists = intent.articles.some((article) => article.id === event.article.id)
        return {
          ...intent,
          isLoading: false,
          articles: exists
            ? intent.articles.map((article) => (article.id === event.article.id ? event.article : article))
            : [...intent.articles, event.article],
        }
      }),
    }
  }

  if (event.type === 'order.completed') {
    return {
      ...state,
      isLoading: false,
      error: null,
      activeOrderId: null,
      isReplayed: false,
      debugEvents: appendDebugEvent(state.debugEvents, `order.completed #${event.orderId}`),
      queryIntents: state.queryIntents.map((intent) => ({
        ...intent,
        isLoading: false,
      })),
    }
  }

  if (event.type === 'order.failed') {
    return {
      ...state,
      isLoading: false,
      error: event.message,
      activeOrderId: null,
      debugEvents: appendDebugEvent(state.debugEvents, `order.failed #${event.orderId}: ${event.message}`),
      queryIntents: state.queryIntents.map((intent) => ({
        ...intent,
        isLoading: false,
      })),
    }
  }

  return state
}

function applyIntentRegenEvent(state: SearchState, intentId: number, event: SearchStreamEvent): SearchState {
  if (event.type === 'order.started') {
    return {
      ...state,
      debugEvents: appendDebugEvent(state.debugEvents, `order.started #${event.orderId} kind=${event.kind}`),
    }
  }

  if (event.type === 'order.progress') {
    return {
      ...state,
      debugEvents: appendDebugEvent(state.debugEvents, `order.progress #${event.orderId} ${event.stage}: ${event.message}`),
    }
  }

  if (event.type === 'article.upserted' && event.intentId === intentId) {
    return {
      ...state,
      debugEvents: appendDebugEvent(state.debugEvents, `article.upserted #${event.orderId} intent=${event.intentId} article=${event.article.id}`),
      queryIntents: state.queryIntents.map((intent) => {
        if (intent.id !== intentId) return intent
        const exists = intent.articles.some((article) => article.id === event.article.id)
        return {
          ...intent,
          isLoading: false,
          articles: exists
            ? intent.articles.map((article) => (article.id === event.article.id ? event.article : article))
            : [...intent.articles, event.article],
        }
      }),
    }
  }

  if (event.type === 'order.completed') {
    return {
      ...state,
      debugEvents: appendDebugEvent(state.debugEvents, `order.completed #${event.orderId}`),
      queryIntents: state.queryIntents.map((intent) => ({
        ...intent,
        isLoading: intent.id === intentId ? false : intent.isLoading,
      })),
    }
  }

  if (event.type === 'order.failed') {
    return {
      ...state,
      error: event.message,
      debugEvents: appendDebugEvent(state.debugEvents, `order.failed #${event.orderId}: ${event.message}`),
      queryIntents: state.queryIntents.map((intent) => ({
        ...intent,
        isLoading: intent.id === intentId ? false : intent.isLoading,
      })),
    }
  }

  return state
}

function reducer(state: SearchState, action: Action): SearchState {
  if (action.type === 'RESET') {
    return { ...initialState }
  }

  if (action.type === 'HYDRATE_FROM_RESULT') {
    return {
      queryId: action.payload.queryId,
      activeOrderId: null,
      query: action.payload.query,
      requestedQuery: action.payload.query,
      correctionApplied: false,
      correctedQuery: null,
      language: action.payload.language,
      spellCorrectionMode: 'auto',
      queryIntents: action.payload.intents,
      isLoading: false,
      error: null,
      isReplayed: true,
      debugEvents: [],
    }
  }

  if (action.type === 'SEARCH_INIT') {
    return {
      ...state,
      queryId: null,
      activeOrderId: null,
      query: action.payload.query,
      requestedQuery: action.payload.query,
      correctionApplied: false,
      correctedQuery: null,
      language: action.payload.requestedLanguage,
      spellCorrectionMode: action.payload.spellCorrectionMode,
      queryIntents: [],
      isLoading: true,
      error: null,
      isReplayed: false,
      debugEvents: [],
    }
  }

  if (action.type === 'SEARCH_CREATED') {
    return {
      ...state,
      queryId: action.payload.queryId,
      query: action.payload.query,
      requestedQuery: action.payload.requestedQuery,
      correctionApplied: action.payload.correctionApplied,
      correctedQuery: action.payload.correctedQuery,
      language: action.payload.language,
      spellCorrectionMode: action.payload.spellCorrectionMode,
    }
  }

  if (action.type === 'SEARCH_READY') {
    return {
      ...state,
      queryIntents: action.payload.intents,
      isLoading: action.payload.isLoading,
      error: null,
      isReplayed: action.payload.isReplayed,
      debugEvents: [],
    }
  }

  if (action.type === 'QUERY_ORDER_ATTACHED') {
    return {
      ...state,
      activeOrderId: action.payload.orderId,
      isLoading: true,
      error: null,
      debugEvents: appendDebugEvent(state.debugEvents, action.payload.message),
    }
  }

  if (action.type === 'QUERY_STREAM_EVENT') {
    return applyQueryOrderStreamEvent(state, action.payload)
  }

  if (action.type === 'QUERY_STREAM_ERROR') {
    return {
      ...state,
      isLoading: false,
      error: action.payload.message,
      activeOrderId: null,
      debugEvents: appendDebugEvent(state.debugEvents, `stream.error: ${action.payload.message}`),
      queryIntents: state.queryIntents.map((intent) => ({
        ...intent,
        isLoading: false,
      })),
    }
  }

  if (action.type === 'RERUN_INTENTS_INIT') {
    return {
      ...state,
      activeOrderId: null,
      isLoading: true,
      error: null,
      isReplayed: false,
      queryIntents: [],
    }
  }

  if (action.type === 'INTENT_REGEN_INIT') {
    return {
      ...state,
      queryIntents: state.queryIntents.map((intent) => ({
        ...intent,
        isLoading: intent.id === action.payload.intentId ? true : intent.isLoading,
      })),
    }
  }

  if (action.type === 'INTENT_REGEN_ORDER_EVENT') {
    return applyIntentRegenEvent(state, action.payload.intentId, action.payload.event)
  }

  if (action.type === 'INTENT_REGEN_STREAM_ERROR') {
    return {
      ...state,
      error: action.payload.message,
      debugEvents: appendDebugEvent(state.debugEvents, `stream.error: ${action.payload.message}`),
      queryIntents: state.queryIntents.map((intent) => ({
        ...intent,
        isLoading: intent.id === action.payload.intentId ? false : intent.isLoading,
      })),
    }
  }

  return state
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const teardownRef = useRef<(() => void) | null>(null)
  const intentStreamTeardownsRef = useRef<Map<number, () => void>>(new Map())
  const requestIdRef = useRef(0)

  const cleanupIntentStreams = () => {
    for (const teardown of intentStreamTeardownsRef.current.values()) {
      teardown()
    }
    intentStreamTeardownsRef.current.clear()
  }

  const beginOrderStream = useCallback((orderId: number, requestId: number) => {
    teardownRef.current = streamOrder({
      orderId,
      onEvent: (event) => {
        if (requestIdRef.current !== requestId) return
        dispatch({ type: 'QUERY_STREAM_EVENT', payload: event })
      },
      onError: (error) => {
        if (requestIdRef.current !== requestId) return
        dispatch({ type: 'QUERY_STREAM_ERROR', payload: { message: error.message } })
      },
    })
  }, [])

  const attachQueryOrderStream = useCallback(
    async (args: { requestId: number; queryId: number }) => {
      try {
        const createdOrder = await createOrder({
          kind: 'query_full',
          queryId: args.queryId,
        })
        if (requestIdRef.current !== args.requestId) return

        dispatch({
          type: 'QUERY_ORDER_ATTACHED',
          payload: {
            orderId: createdOrder.orderId,
            message: `order.attach #${createdOrder.orderId}`,
          },
        })
        beginOrderStream(createdOrder.orderId, args.requestId)
        return
      } catch (error) {
        if (!isResourceLockedError(error)) {
          throw error
        }

        const activeOrderId = error.payload?.activeOrderId
        if (typeof activeOrderId !== 'number') {
          throw error
        }
        if (requestIdRef.current !== args.requestId) return

        dispatch({
          type: 'QUERY_ORDER_ATTACHED',
          payload: {
            orderId: activeOrderId,
            message: `order.attach.locked #${activeOrderId}`,
          },
        })
        beginOrderStream(activeOrderId, args.requestId)
      }
    },
    [beginOrderStream]
  )

  const reset = useCallback(() => {
    requestIdRef.current += 1
    teardownRef.current?.()
    teardownRef.current = null
    cleanupIntentStreams()
    dispatch({ type: 'RESET' })
  }, [])

  const hydrateFromResult = useCallback(
    (args: {
      queryId: number
      query: string
      language?: string
      intents: Array<{
        id: number
        intent: string
        articles: Array<{ id: number; title: string; slug: string; summary: string }>
      }>
    }) => {
      dispatch({
        type: 'HYDRATE_FROM_RESULT',
        payload: {
          queryId: args.queryId,
          query: args.query,
          language: args.language || 'auto',
          intents: args.intents.map((intent) => ({
            id: intent.id,
            intent: intent.intent,
            articles: intent.articles,
            isLoading: false,
          })),
        },
      })
    },
    []
  )

  const startSearch = useCallback(async (args: {
    query: string
    language?: string
    spellCorrectionMode?: 'off' | 'auto' | 'force'
    forceRegenerate?: boolean
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
    cleanupIntentStreams()

    dispatch({
      type: 'SEARCH_INIT',
      payload: {
        query: queryValue,
        requestedLanguage,
        spellCorrectionMode,
      },
    })

    const created = await createQuery({
      query: queryValue,
      language: effectiveLanguage,
      spellCorrectionMode,
      forceRegenerate: args.forceRegenerate === true,
    })
    if (requestIdRef.current !== requestId) return

    dispatch({
      type: 'SEARCH_CREATED',
      payload: {
        queryId: created.queryId,
        query: created.query,
        requestedQuery: created.originalQuery,
        correctionApplied: created.correctionApplied,
        correctedQuery: created.correctedQuery,
        language: created.language,
        spellCorrectionMode: created.spellCorrectionMode,
      },
    })

    const queryResult = await getQueryResult(created.queryId)
    if (requestIdRef.current !== requestId) return

    const existingIntents: SearchIntent[] = queryResult.intents.map((intent) => ({
      id: intent.id,
      intent: intent.intent,
      articles: intent.articles,
      isLoading: false,
    }))

    const availability = await getOrderAvailability({
      kind: 'query_full',
      queryId: created.queryId,
    })
    if (requestIdRef.current !== requestId) return

    if (!availability.available && typeof availability.activeOrderId === 'number') {
      dispatch({
        type: 'SEARCH_READY',
        payload: {
          intents: existingIntents.map((intent) => ({
            ...intent,
            isLoading: intent.articles.length === 0,
          })),
          isLoading: true,
          isReplayed: false,
        },
      })
      dispatch({
        type: 'QUERY_ORDER_ATTACHED',
        payload: {
          orderId: availability.activeOrderId,
          message: `order.attach.locked #${availability.activeOrderId}`,
        },
      })
      beginOrderStream(availability.activeOrderId, requestId)
      return
    }

    const queryShouldLoad = args.forceRegenerate === true || existingIntents.length === 0
    dispatch({
      type: 'SEARCH_READY',
      payload: {
        intents: existingIntents,
        isLoading: queryShouldLoad,
        isReplayed: existingIntents.length > 0 && args.forceRegenerate !== true,
      },
    })

    if (existingIntents.length > 0 && args.forceRegenerate !== true) {
      return
    }

    await attachQueryOrderStream({ requestId, queryId: created.queryId })
  }, [attachQueryOrderStream, beginOrderStream])

  const rerunIntentResolve = useCallback(async () => {
    const queryId = state.queryId
    if (!queryId) return

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    teardownRef.current?.()
    teardownRef.current = null
    cleanupIntentStreams()

    dispatch({ type: 'RERUN_INTENTS_INIT' })
    await attachQueryOrderStream({ requestId, queryId })
  }, [attachQueryOrderStream, state.queryId])

  const rerunArticleGenerationForIntent = useCallback(async (intentId: number) => {
    const queryId = state.queryId
    if (!queryId || !Number.isInteger(intentId) || intentId <= 0) return

    dispatch({ type: 'INTENT_REGEN_INIT', payload: { intentId } })

    let orderId: number
    try {
      const created = await createOrder({
        kind: 'article_content_generate',
        queryId,
        intentId,
      })
      orderId = created.orderId
    } catch (error) {
      if (!isResourceLockedError(error) || typeof error.payload?.activeOrderId !== 'number') {
        const message = error instanceof Error ? error.message : 'Failed to create regeneration order'
        dispatch({ type: 'INTENT_REGEN_STREAM_ERROR', payload: { intentId, message } })
        throw error
      }
      orderId = error.payload.activeOrderId
    }

    await new Promise<void>((resolve) => {
      const existing = intentStreamTeardownsRef.current.get(intentId)
      if (existing) {
        existing()
        intentStreamTeardownsRef.current.delete(intentId)
      }

      const teardown = streamOrder({
        orderId,
        onEvent: (event) => {
          dispatch({ type: 'INTENT_REGEN_ORDER_EVENT', payload: { intentId, event } })

          if (event.type === 'order.completed' || event.type === 'order.failed') {
            const active = intentStreamTeardownsRef.current.get(intentId)
            if (active) {
              active()
              intentStreamTeardownsRef.current.delete(intentId)
            }
            resolve()
          }
        },
        onError: (error) => {
          dispatch({ type: 'INTENT_REGEN_STREAM_ERROR', payload: { intentId, message: error.message } })
          const active = intentStreamTeardownsRef.current.get(intentId)
          if (active) {
            active()
            intentStreamTeardownsRef.current.delete(intentId)
          }
          resolve()
        },
      })

      intentStreamTeardownsRef.current.set(intentId, teardown)
    })
  }, [state.queryId])

  const value = useMemo(
    () => ({
      ...state,
      startSearch,
      hydrateFromResult,
      rerunIntentResolve,
      rerunArticleGenerationForIntent,
      reset,
    }),
    [state, startSearch, hydrateFromResult, rerunIntentResolve, rerunArticleGenerationForIntent, reset]
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
