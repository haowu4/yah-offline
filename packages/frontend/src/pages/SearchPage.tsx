import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { SearchUI } from '../components/SearchUI'
import { useSearchCtx } from '../ctx/SearchCtx'
import styles from './SearchPage.module.css'

export function SearchPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const search = useSearchCtx()

  const queryFromUrl = params.get('query')?.trim() ?? ''
  const autoRetryQueryRef = useRef<string>('')

  useEffect(() => {
    document.title = queryFromUrl ? `${queryFromUrl} | Search | yah` : 'Search | yah'
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

    if (autoRetryQueryRef.current && autoRetryQueryRef.current !== queryFromUrl) {
      autoRetryQueryRef.current = ''
    }

    if (
      search.query === queryFromUrl &&
      !search.isLoading &&
      search.queryIntents.length === 0 &&
      Boolean(search.error) &&
      autoRetryQueryRef.current !== queryFromUrl
    ) {
      autoRetryQueryRef.current = queryFromUrl
      void search.startSearch(queryFromUrl)
      return
    }

    if (
      search.query === queryFromUrl &&
      (search.isLoading || search.queryIntents.length > 0)
    ) {
      return
    }

    void search.startSearch(queryFromUrl)
  }, [
    queryFromUrl,
    search.error,
    search.isLoading,
    search.query,
    search.queryIntents.length,
    search.startSearch,
  ])

  const handleSearch = async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) {
      navigate('/search')
      search.reset()
      return
    }

    navigate(`/search?query=${encodeURIComponent(trimmed)}`)
    await search.startSearch(trimmed)
  }

  return (
    <div className={styles.page}>
      <SearchUI
        initialQuery={queryFromUrl}
        query={search.query}
        queryIntents={search.queryIntents}
        isLoading={search.isLoading}
        isReplayed={search.isReplayed}
        error={search.error}
        onSearch={handleSearch}
      />
    </div>
  )
}
