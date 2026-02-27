import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
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
  snippet: string
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

function appendDebugEvent(events: SearchDebugEvent[], message: string): SearchDebugEvent[] {
  const next = [...events, { at: new Date().toISOString(), message }]
  if (next.length <= 80) return next
  return next.slice(next.length - 80)
}

function applyStreamEvent(state: SearchState, event: SearchStreamEvent): SearchState {
  if (event.type === 'order.started') {
    return {
      ...state,
      isLoading: true,
      error: null,
      activeOrderId: event.orderId,
      debugEvents: appendDebugEvent(
        state.debugEvents,
        `order.started #${event.orderId} kind=${event.kind}`
      ),
    }
  }

  if (event.type === 'order.progress') {
    return {
      ...state,
      debugEvents: appendDebugEvent(
        state.debugEvents,
        `order.progress #${event.orderId} ${event.stage}: ${event.message}`
      ),
    }
  }

  if (event.type === 'intent.upserted') {
    const alreadyExists = state.queryIntents.some((intent) => intent.id === event.intent.id)
    if (alreadyExists) {
      return state
    }

    return {
      ...state,
      debugEvents: appendDebugEvent(
        state.debugEvents,
        `intent.upserted #${event.orderId} intent=${event.intent.id}`
      ),
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
      debugEvents: appendDebugEvent(
        state.debugEvents,
        `article.upserted #${event.orderId} intent=${event.intentId} article=${event.article.id}`
      ),
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
      debugEvents: appendDebugEvent(
        state.debugEvents,
        `order.failed #${event.orderId}: ${event.message}`
      ),
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
  })
  const teardownRef = useRef<(() => void) | null>(null)
  const intentStreamTeardownsRef = useRef<Map<number, () => void>>(new Map())
  const requestIdRef = useRef(0)

  const beginOrderStream = useCallback((orderId: number, requestId: number) => {
    teardownRef.current = streamOrder({
      orderId,
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
          activeOrderId: null,
          debugEvents: appendDebugEvent(prev.debugEvents, `stream.error: ${error.message}`),
          queryIntents: prev.queryIntents.map((intent) => ({
            ...intent,
            isLoading: false,
          })),
        }))
      },
    })
  }, [])

  const attachOrderStream = useCallback(
    async (args: {
      requestId: number
      queryId: number
      kind: 'query_full' | 'article_regen_keep_title'
      intentId?: number
    }) => {
      try {
        const createdOrder = await createOrder({
          kind: args.kind,
          queryId: args.queryId,
          intentId: args.intentId,
        })
        if (requestIdRef.current !== args.requestId) return

        setState((prev) => ({
          ...prev,
          activeOrderId: createdOrder.orderId,
          isLoading: true,
          error: null,
          debugEvents: appendDebugEvent(prev.debugEvents, `order.attach #${createdOrder.orderId}`),
        }))

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

        setState((prev) => ({
          ...prev,
          activeOrderId,
          isLoading: true,
          error: null,
          debugEvents: appendDebugEvent(prev.debugEvents, `order.attach.locked #${activeOrderId}`),
        }))
        beginOrderStream(activeOrderId, args.requestId)
      }
    },
    [beginOrderStream]
  )

  const reset = useCallback(() => {
    requestIdRef.current += 1
    teardownRef.current?.()
    teardownRef.current = null
    for (const teardown of intentStreamTeardownsRef.current.values()) {
      teardown()
    }
    intentStreamTeardownsRef.current.clear()
    setState({
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
        activeOrderId: null,
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
        debugEvents: [],
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
    for (const teardown of intentStreamTeardownsRef.current.values()) {
      teardown()
    }
    intentStreamTeardownsRef.current.clear()

    setState({
      queryId: null,
      activeOrderId: null,
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
      debugEvents: [],
    })

    const created = await createQuery({
      query: queryValue,
      language: effectiveLanguage,
      spellCorrectionMode,
      forceRegenerate: args.forceRegenerate === true,
    })
    if (requestIdRef.current !== requestId) {
      return
    }

    const queryResult = await getQueryResult(created.queryId)
    if (requestIdRef.current !== requestId) {
      return
    }

    const existingIntents = queryResult.intents.map((intent) => ({
      id: intent.id,
      intent: intent.intent,
      articles: intent.articles,
      isLoading: false,
    }))

    const availability = await getOrderAvailability({
      kind: 'query_full',
      queryId: created.queryId,
    })
    if (requestIdRef.current !== requestId) {
      return
    }

    if (!availability.available && typeof availability.activeOrderId === 'number') {
      setState((prev) => ({
        ...prev,
        queryId: created.queryId,
        activeOrderId: availability.activeOrderId ?? null,
        query: created.query,
        requestedQuery: created.originalQuery,
        correctionApplied: created.correctionApplied,
        correctedQuery: created.correctedQuery,
        language: created.language,
        spellCorrectionMode: created.spellCorrectionMode,
        queryIntents: existingIntents.map((intent) => ({
          ...intent,
          isLoading: intent.articles.length === 0,
        })),
        isLoading: true,
        error: null,
        isReplayed: false,
        debugEvents: appendDebugEvent(
          prev.debugEvents,
          `order.attach.locked #${availability.activeOrderId}`
        ),
      }))
      beginOrderStream(availability.activeOrderId, requestId)
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
      queryIntents: existingIntents,
      isLoading: args.forceRegenerate === true || existingIntents.length === 0,
      error: null,
      isReplayed: existingIntents.length > 0 && args.forceRegenerate !== true,
      debugEvents: [],
    }))

    if (existingIntents.length > 0 && args.forceRegenerate !== true) {
      return
    }

    await attachOrderStream({
      requestId,
      queryId: created.queryId,
      kind: 'query_full',
    })
  }, [attachOrderStream])

  const rerunIntentResolve = useCallback(async () => {
    const queryId = state.queryId
    if (!queryId) return

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    teardownRef.current?.()
    teardownRef.current = null
    for (const teardown of intentStreamTeardownsRef.current.values()) {
      teardown()
    }
    intentStreamTeardownsRef.current.clear()

    setState((prev) => ({
      ...prev,
      activeOrderId: null,
      isLoading: true,
      error: null,
      isReplayed: false,
      queryIntents: [],
    }))

    await attachOrderStream({
      requestId,
      queryId,
      kind: 'query_full',
    })
  }, [attachOrderStream, state.queryId])

  const rerunArticleGenerationForIntent = useCallback(async (intentId: number) => {
    const queryId = state.queryId
    if (!queryId || !Number.isInteger(intentId) || intentId <= 0) return

    setState((prev) => ({
      ...prev,
      queryIntents: prev.queryIntents.map((intent) => ({
        ...intent,
        isLoading: intent.id === intentId ? true : intent.isLoading,
      })),
    }))

    let orderId: number
    try {
      const created = await createOrder({
        kind: 'article_regen_keep_title',
        queryId,
        intentId,
      })
      orderId = created.orderId
    } catch (error) {
      if (!isResourceLockedError(error) || typeof error.payload?.activeOrderId !== 'number') {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to create regeneration order',
          queryIntents: prev.queryIntents.map((intent) => ({
            ...intent,
            isLoading: intent.id === intentId ? false : intent.isLoading,
          })),
        }))
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
          setState((prev) => {
            if (event.type === 'order.started') {
              return {
                ...prev,
                debugEvents: appendDebugEvent(prev.debugEvents, `order.started #${event.orderId} kind=${event.kind}`),
              }
            }

            if (event.type === 'order.progress') {
              return {
                ...prev,
                debugEvents: appendDebugEvent(prev.debugEvents, `order.progress #${event.orderId} ${event.stage}: ${event.message}`),
              }
            }

            if (event.type === 'article.upserted' && event.intentId === intentId) {
              return {
                ...prev,
                debugEvents: appendDebugEvent(prev.debugEvents, `article.upserted #${event.orderId} intent=${event.intentId} article=${event.article.id}`),
                queryIntents: prev.queryIntents.map((intent) => {
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
                ...prev,
                debugEvents: appendDebugEvent(prev.debugEvents, `order.completed #${event.orderId}`),
                queryIntents: prev.queryIntents.map((intent) => ({
                  ...intent,
                  isLoading: intent.id === intentId ? false : intent.isLoading,
                })),
              }
            }

            if (event.type === 'order.failed') {
              return {
                ...prev,
                error: event.message,
                debugEvents: appendDebugEvent(prev.debugEvents, `order.failed #${event.orderId}: ${event.message}`),
                queryIntents: prev.queryIntents.map((intent) => ({
                  ...intent,
                  isLoading: intent.id === intentId ? false : intent.isLoading,
                })),
              }
            }

            return prev
          })

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
          setState((prev) => ({
            ...prev,
            error: error.message,
            debugEvents: appendDebugEvent(prev.debugEvents, `stream.error: ${error.message}`),
            queryIntents: prev.queryIntents.map((intent) => ({
              ...intent,
              isLoading: intent.id === intentId ? false : intent.isLoading,
            })),
          }))
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
