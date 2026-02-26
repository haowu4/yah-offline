import { useState } from 'react'
import { Link } from 'react-router'
import type { FormEvent } from 'react'
import type { SearchIntent } from '../ctx/SearchCtx'
import type { ApiSearchSuggestionItem } from '../lib/api/search'
import styles from './SearchUI.module.css'

type SearchUIProps = {
  initialQuery: string
  query: string
  requestedQuery: string
  language: string
  correctionApplied: boolean
  correctedQuery: string | null
  queryIntents: SearchIntent[]
  isLoading: boolean
  isReplayed: boolean
  error: string | null
  examples: string[]
  recent: ApiSearchSuggestionItem[]
  isFirstTimeUser: boolean
  onSearch: (query: string) => Promise<void>
  onSearchOriginal: () => Promise<void>
}

export function SearchUI(props: SearchUIProps) {
  const [input, setInput] = useState(props.initialQuery)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await props.onSearch(input)
  }

  const hasResults = props.queryIntents.length > 0
  const isHome = !props.query && !hasResults
  const statusMessage = hasResults ? 'Almost there, finalizing results' : 'Understanding your query'
  const showResultSummary = !isHome && !props.isLoading && hasResults && !props.error
  const showCorrectionHint =
    !isHome &&
    props.correctionApplied &&
    Boolean(props.correctedQuery) &&
    !props.error
  const normalize = (value: string) => value.trim().toLowerCase()

  return (
    <div className={styles.container}>
      {props.isLoading && !isHome ? (
        <p className={styles.statusLine}>
          <span>{statusMessage}</span>
          <span className={styles.statusDots} aria-hidden>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      ) : null}
      {showResultSummary ? <p className={styles.statusLine}>Showing results for "{props.query}"</p> : null}
      {showCorrectionHint && props.correctedQuery ? (
        <p className={styles.statusLine}>
          Including results for "{props.correctedQuery}".{' '}
          <button type="button" className={styles.inlineButton} onClick={() => void props.onSearchOriginal()}>
            Search only for "{props.requestedQuery}"
          </button>
        </p>
      ) : null}
      {props.error ? <p className={styles.error}>{props.error}</p> : null}

      {isHome ? (
        <div className={styles.home}>
          <div className={styles.homeHero}>
            <img src="/logo.png" alt="yah" className={styles.homeLogo} />
            <h1 className={styles.homeTitle}>yah</h1>
          </div>
          <form onSubmit={handleSubmit} className={styles.homeForm}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Search..."
              className={styles.homeInput}
            />
            <button type="submit" className={styles.submit}>
              Search
            </button>
          </form>
          <div className={styles.suggestionsPanel}>
            {props.recent.length > 0 ? (
              <section className={styles.suggestionsSection}>
                <h2 className={styles.suggestionsTitle}>Recent searches</h2>
                <div className={styles.suggestionGrid}>
                  {props.recent.map((item) => (
                    <button
                      key={`${item.value}-${item.language}-${item.lastSearchedAt}`}
                      type="button"
                      className={styles.suggestionChip}
                      onClick={() => {
                        setInput(item.value)
                        void props.onSearch(item.value)
                      }}
                    >
                      <span>{item.value}</span>
                      <small className={styles.recentMeta}>{item.language}</small>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {props.examples.length > 0 ? (
              <section className={styles.suggestionsSection}>
                <h2 className={styles.suggestionsTitle}>
                  {props.isFirstTimeUser ? 'Try these examples' : 'Explore with examples'}
                </h2>
                <div className={styles.suggestionGrid}>
                  {props.examples.map((query) => (
                    <button
                      key={query}
                      type="button"
                      className={styles.suggestionChip}
                      onClick={() => {
                        setInput(query)
                        void props.onSearch(query)
                      }}
                    >
                      {query}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {props.query && !hasResults && !props.isLoading ? <p>No results yet.</p> : null}

      {hasResults ? (
        <div className={styles.grid}>
          {props.queryIntents.map((intent) => {
            const firstArticle = intent.articles[0]
            const isDuplicateTitle =
              firstArticle && normalize(firstArticle.title) === normalize(intent.intent)

            return (
              <section key={intent.id} className={styles.intentCard}>
                {!isDuplicateTitle ? <h2 className={styles.intentTitle}>{intent.intent}</h2> : null}
                {intent.isLoading ? <p className={styles.intentStatus}>Finalizing this result...</p> : null}
                {intent.articles.length === 0 && !intent.isLoading ? <p>No answer yet.</p> : null}
                <ul className={styles.articleList}>
                  {intent.articles.map((article) => (
                    <li key={article.id} className={styles.articleItem}>
                      <Link
                        to={`/content/${article.slug}?query=${encodeURIComponent(props.requestedQuery || props.query)}${props.language && props.language !== 'auto' ? `&lang=${encodeURIComponent(props.language)}` : ''}`}
                        className={styles.articleLink}
                      >
                        {article.title}
                      </Link>
                      <p className={styles.articleSnippet}>{article.snippet}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
          {props.isLoading ? (
            <>
              {Array.from({ length: hasResults ? 1 : 3 }).map((_, idx) => (
                <section key={`skeleton-${idx}`} className={styles.skeletonCard} aria-hidden>
                  <div className={styles.skeletonIntent} />
                  <div className={styles.skeletonTitle} />
                  <div className={styles.skeletonLine} />
                  <div className={styles.skeletonLineShort} />
                </section>
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {!hasResults && props.isLoading ? (
        <div className={styles.grid}>
          {Array.from({ length: 3 }).map((_, idx) => (
            <section key={`skeleton-empty-${idx}`} className={styles.skeletonCard} aria-hidden>
              <div className={styles.skeletonIntent} />
              <div className={styles.skeletonTitle} />
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLineShort} />
            </section>
          ))}
        </div>
      ) : null}
    </div>
  )
}
