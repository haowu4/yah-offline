import { useState } from 'react'
import { Link } from 'react-router'
import type { FormEvent } from 'react'
import type { SearchIntent } from '../ctx/SearchCtx'
import styles from './SearchUI.module.css'

type SearchUIProps = {
  initialQuery: string
  query: string
  queryIntents: SearchIntent[]
  isLoading: boolean
  isReplayed: boolean
  error: string | null
  onSearch: (query: string) => Promise<void>
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
                        to={`/content/${article.slug}?query=${encodeURIComponent(props.query)}`}
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
