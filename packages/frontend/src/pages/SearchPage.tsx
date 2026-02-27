import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { SearchUI } from '../components/SearchUI'
import { useSearchCtx } from '../ctx/SearchCtx'
import { useLanguageCtx } from '../ctx/LanguageCtx'
import { useI18n } from '../i18n/useI18n'
import {
  getArticleGenerationEta,
  getSearchSuggestions,
  type ApiSearchSuggestionItem,
  type ArticleGenerationEtaPayload,
} from '../lib/api/search'
import { listConfigs } from '../lib/api/config'
import styles from './SearchPage.module.css'

function parseSpellMode(value: string | null): 'off' | 'auto' | 'force' {
  if (value === 'off' || value === 'auto' || value === 'force') return value
  return 'auto'
}

const DEFAULT_FILETYPE_ALLOWLIST = new Set([
  'md', 'txt', 'sh', 'bash', 'zsh', 'py', 'js', 'ts', 'tsx', 'jsx',
  'json', 'yaml', 'yml', 'toml', 'ini', 'xml', 'sql', 'csv', 'java',
  'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'rb', 'php',
])
const DEFAULT_ARTICLE_ETA_MS = 8000
const INITIAL_EXPECTED_ARTICLE_COUNT = 4

function parseFiletypeOperators(query: string): { filetypes: string[] } {
  const filetypes: string[] = []
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  for (const token of tokens) {
    const match = token.match(/^filetype:(.+)$/i)
    if (!match) continue
    const normalized = (match[1] || '').trim().toLowerCase().replace(/^\.+/, '')
    if (!normalized || !/^[a-z0-9][a-z0-9_-]{0,15}$/.test(normalized)) continue
    filetypes.push(normalized)
  }
  return { filetypes }
}

function formatDurationShort(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

export function SearchPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const search = useSearchCtx()
  const { language } = useLanguageCtx()
  const { t, locale } = useI18n()

  const queryFromUrl = params.get('query')?.trim() ?? ''
  const languageFromUrl = language
  const spellModeFromUrl = parseSpellMode(params.get('sc'))
  const autoRetryKeyRef = useRef<string>('')
  const [examples, setExamples] = useState<string[]>([])
  const [recent, setRecent] = useState<ApiSearchSuggestionItem[]>([])
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(true)
  const [filetypeAllowlist, setFiletypeAllowlist] = useState<Set<string>>(DEFAULT_FILETYPE_ALLOWLIST)
  const [eta, setEta] = useState<ArticleGenerationEtaPayload | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const loadingStartedAtRef = useRef<number | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [rerunMode, setRerunMode] = useState<'query' | 'intents' | null>(null)
  const [rerunningIntentIds, setRerunningIntentIds] = useState<number[]>([])

  useEffect(() => {
    document.title = queryFromUrl ? t('search.page.title.query', { query: queryFromUrl }) : t('search.page.title')
  }, [queryFromUrl, t])

  useEffect(() => {
    if (queryFromUrl) return
    let cancelled = false

    void getSearchSuggestions({ recentLimit: 8, language: locale })
      .then((payload) => {
        if (cancelled) return
        setExamples(payload.examples)
        setRecent(payload.recent)
        setIsFirstTimeUser(payload.isFirstTimeUser)
      })
      .catch(() => {
        if (cancelled) return
        setExamples([])
        setRecent([])
        setIsFirstTimeUser(true)
      })

    return () => {
      cancelled = true
    }
  }, [locale, queryFromUrl])

  useEffect(() => {
    let cancelled = false
    void listConfigs()
      .then((payload) => {
        if (cancelled) return
        const row = payload.configs.find((item) => item.key === 'search.filetype.allowlist')
        if (!row?.value) return
        try {
          const parsed = JSON.parse(row.value) as unknown
          if (!Array.isArray(parsed)) return
          const normalized = parsed
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean)
          if (normalized.length === 0) return
          setFiletypeAllowlist(new Set(normalized))
        } catch {
          // Keep default allowlist in frontend; backend remains source of truth.
        }
      })
      .catch(() => {
        // Config routes may be disabled in some environments.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void getArticleGenerationEta()
      .then((payload) => {
        if (cancelled) return
        setEta(payload)
      })
      .catch(() => {
        if (cancelled) return
        setEta(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!search.isLoading) {
      loadingStartedAtRef.current = null
      setElapsedMs(0)
      return
    }
    if (loadingStartedAtRef.current == null) {
      loadingStartedAtRef.current = Date.now()
    }
    const timer = setInterval(() => {
      if (loadingStartedAtRef.current == null) return
      setElapsedMs(Date.now() - loadingStartedAtRef.current)
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [search.isLoading])

  const elapsedLabel = search.isLoading ? formatDurationShort(elapsedMs) : null
  const expectedArticleCount = search.queryIntents.length > 0
    ? Math.max(1, search.queryIntents.length)
    : INITIAL_EXPECTED_ARTICLE_COUNT
  const averageDurationMs = eta?.enabled
    ? (typeof eta.averageDurationMs === 'number' && eta.averageDurationMs > 0 ? eta.averageDurationMs : DEFAULT_ARTICLE_ETA_MS)
    : null
  const typicalTotalMs = averageDurationMs !== null ? averageDurationMs * expectedArticleCount : null
  const typicalTotalLabel = typicalTotalMs !== null ? formatDurationShort(typicalTotalMs) : null
  const etaMs = typicalTotalMs !== null ? Math.max(0, typicalTotalMs - elapsedMs) : null
  const etaLabel = etaMs !== null ? formatDurationShort(etaMs) : null
  const overrunMs = typicalTotalMs !== null && elapsedMs > typicalTotalMs ? elapsedMs - typicalTotalMs : null
  const overrunLabel = overrunMs !== null ? formatDurationShort(overrunMs) : null

  useEffect(() => {
    if (queryFromUrl) return
    if (
      search.query ||
      search.queryIntents.length > 0 ||
      search.isLoading ||
      search.error ||
      search.isReplayed
    ) {
      search.reset()
    }
  }, [
    queryFromUrl,
    search.error,
    search.isLoading,
    search.isReplayed,
    search.query,
    search.queryIntents.length,
    search.reset,
  ])

  useEffect(() => {
    if (!queryFromUrl) return

    const runKey = `${queryFromUrl}::${languageFromUrl}::${spellModeFromUrl}`

    if (autoRetryKeyRef.current && autoRetryKeyRef.current !== runKey) {
      autoRetryKeyRef.current = ''
    }

    if (
      search.requestedQuery === queryFromUrl &&
      search.language === languageFromUrl &&
      search.spellCorrectionMode === spellModeFromUrl &&
      !search.isLoading &&
      search.queryIntents.length === 0 &&
      Boolean(search.error) &&
      autoRetryKeyRef.current !== runKey
    ) {
      autoRetryKeyRef.current = runKey
      void search.startSearch({
        query: queryFromUrl,
        language: languageFromUrl,
        spellCorrectionMode: spellModeFromUrl,
      })
      return
    }

    if (
      search.requestedQuery === queryFromUrl &&
      search.language === languageFromUrl &&
      search.spellCorrectionMode === spellModeFromUrl &&
      (search.isLoading || search.queryId !== null || search.queryIntents.length > 0)
    ) {
      return
    }

    void search.startSearch({
      query: queryFromUrl,
      language: languageFromUrl,
      spellCorrectionMode: spellModeFromUrl,
    })
  }, [
    languageFromUrl,
    queryFromUrl,
    search.error,
    search.isLoading,
    search.language,
    search.queryId,
    search.queryIntents.length,
    search.requestedQuery,
    search.spellCorrectionMode,
    search.startSearch,
    spellModeFromUrl,
  ])

  const handleSearch = async (query: string) => {
    if (search.isLoading && search.activeOrderId) return

    const trimmed = query.trim()
    if (!trimmed) {
      navigate('/search')
      search.reset()
      setValidationError(null)
      return
    }

    const parsedOperators = parseFiletypeOperators(trimmed)
    if (parsedOperators.filetypes.length > 1) {
      setValidationError(t('search.validation.filetype.multiple'))
      return
    }
    if (parsedOperators.filetypes.length === 1 && !filetypeAllowlist.has(parsedOperators.filetypes[0])) {
      setValidationError(t('search.validation.filetype.unsupported', { filetype: parsedOperators.filetypes[0] }))
      return
    }
    setValidationError(null)

    const params = new URLSearchParams()
    params.set('query', trimmed)
    if (languageFromUrl && languageFromUrl !== 'auto') {
      params.set('lang', languageFromUrl)
    }
    if (spellModeFromUrl !== 'auto') {
      params.set('sc', spellModeFromUrl)
    }

    navigate(`/search?${params.toString()}`)
    await search.startSearch({
      query: trimmed,
      language: languageFromUrl,
      spellCorrectionMode: spellModeFromUrl,
    })
  }

  const handleSearchOriginal = async () => {
    const original = (search.requestedQuery || queryFromUrl).trim()
    if (!original) return

    const params = new URLSearchParams()
    params.set('query', original)
    if (languageFromUrl && languageFromUrl !== 'auto') {
      params.set('lang', languageFromUrl)
    }
    params.set('sc', 'off')

    navigate(`/search?${params.toString()}`)
    await search.startSearch({
      query: original,
      language: languageFromUrl,
      spellCorrectionMode: 'off',
    })
  }

  const handleRerunIntents = async () => {
    setRerunMode('intents')
    try {
      await search.rerunIntentResolve()
    } finally {
      setRerunMode(null)
    }
  }

  const handleRerunQuery = async () => {
    const value = (search.requestedQuery || queryFromUrl).trim()
    if (!value) return
    setRerunMode('query')
    try {
      await search.startSearch({
        query: value,
        language: languageFromUrl,
        spellCorrectionMode: spellModeFromUrl,
        forceRegenerate: true,
      })
    } finally {
      setRerunMode(null)
    }
  }

  const handleRerunArticle = async (intentId: number) => {
    setRerunningIntentIds((prev) => (prev.includes(intentId) ? prev : [...prev, intentId]))
    try {
      await search.rerunArticleGenerationForIntent(intentId)
    } finally {
      setRerunningIntentIds((prev) => prev.filter((id) => id !== intentId))
    }
  }

  return (
    <div className={styles.page}>
      <SearchUI
        initialQuery={queryFromUrl}
        query={search.query}
        requestedQuery={search.requestedQuery}
        language={search.language}
        correctionApplied={search.correctionApplied}
        correctedQuery={search.correctedQuery}
        queryIntents={search.queryIntents}
        isLoading={search.isLoading}
        activeOrderId={search.activeOrderId}
        debugEvents={search.debugEvents}
        isReplayed={search.isReplayed}
        error={search.error}
        validationError={validationError}
        elapsedLabel={elapsedLabel}
        typicalTotalLabel={typicalTotalLabel}
        etaLabel={etaLabel}
        overrunLabel={overrunLabel}
        examples={examples}
        recent={recent}
        isFirstTimeUser={isFirstTimeUser}
        isRerunningQuery={rerunMode === 'query'}
        isRerunningIntents={rerunMode === 'intents'}
        isRerunningArticles={rerunningIntentIds.length > 0}
        rerunningIntentIds={rerunningIntentIds}
        onSearch={handleSearch}
        onSearchOriginal={handleSearchOriginal}
        onRerunQuery={handleRerunQuery}
        onRerunIntents={handleRerunIntents}
        onRerunArticle={handleRerunArticle}
      />
    </div>
  )
}
