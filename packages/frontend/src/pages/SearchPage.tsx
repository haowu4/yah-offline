import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { SearchUI } from '../components/SearchUI'
import { useSearchCtx } from '../ctx/SearchCtx'
import { useLanguageCtx } from '../ctx/LanguageCtx'
import { getSearchSuggestions, type ApiSearchSuggestionItem } from '../lib/api/search'
import styles from './SearchPage.module.css'

function parseSpellMode(value: string | null): 'off' | 'auto' | 'force' {
  if (value === 'off' || value === 'auto' || value === 'force') return value
  return 'auto'
}

export function SearchPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const search = useSearchCtx()
  const { language } = useLanguageCtx()

  const queryFromUrl = params.get('query')?.trim() ?? ''
  const languageFromUrl = language
  const spellModeFromUrl = parseSpellMode(params.get('sc'))
  const autoRetryKeyRef = useRef<string>('')
  const [examples, setExamples] = useState<string[]>([])
  const [recent, setRecent] = useState<ApiSearchSuggestionItem[]>([])
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(true)

  useEffect(() => {
    document.title = queryFromUrl ? `${queryFromUrl} | Search | yah` : 'Search | yah'
  }, [queryFromUrl])

  useEffect(() => {
    if (queryFromUrl) return
    let cancelled = false

    void getSearchSuggestions({ recentLimit: 8 })
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
  }, [queryFromUrl])

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
      (search.isLoading || search.queryIntents.length > 0)
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
    search.queryIntents.length,
    search.requestedQuery,
    search.spellCorrectionMode,
    search.startSearch,
    spellModeFromUrl,
  ])

  const handleSearch = async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) {
      navigate('/search')
      search.reset()
      return
    }

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
        isReplayed={search.isReplayed}
        error={search.error}
        examples={examples}
        recent={recent}
        isFirstTimeUser={isFirstTimeUser}
        onSearch={handleSearch}
        onSearchOriginal={handleSearchOriginal}
      />
    </div>
  )
}
