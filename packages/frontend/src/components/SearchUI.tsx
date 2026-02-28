import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { useState } from 'react'
import { FiRefreshCw, FiTool, FiX } from 'react-icons/fi'
import { Link } from 'react-router'
import type { FormEvent } from 'react'
import type { SearchDebugEvent, SearchIntent } from '../ctx/SearchCtx'
import { useI18n } from '../i18n/useI18n'
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
  activeOrderId: number | null
  debugEvents: SearchDebugEvent[]
  isReplayed: boolean
  error: string | null
  validationError?: string | null
  elapsedLabel?: string | null
  typicalTotalLabel?: string | null
  etaLabel?: string | null
  overrunLabel?: string | null
  examples: string[]
  recent: ApiSearchSuggestionItem[]
  isFirstTimeUser: boolean
  isRerunningQuery: boolean
  isRerunningIntents: boolean
  isRerunningArticles: boolean
  rerunningIntentIds: number[]
  onSearch: (query: string) => Promise<void>
  onSearchOriginal: () => Promise<void>
  onRerunQuery: () => Promise<void>
  onRerunIntents: () => Promise<void>
  onRerunArticle: (intentId: number) => Promise<void>
}

export function SearchUI(props: SearchUIProps) {
  const { t } = useI18n()
  const [input, setInput] = useState(props.initialQuery)
  const [showDebug, setShowDebug] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await props.onSearch(input)
  }

  const hasResults = props.queryIntents.length > 0
  const isHome = !props.query && !hasResults
  const statusMessage = hasResults ? t('search.status.finalizing') : t('search.status.understanding')
  const showResultSummary = !isHome && !props.isLoading && hasResults && !props.error
  const showCorrectionHint =
    !isHome &&
    props.correctionApplied &&
    Boolean(props.correctedQuery) &&
    !props.error

  return (
    <div className={styles.container}>
      {props.isLoading && !isHome ? (
        <div className={styles.statusLineRow}>
          <p className={`${styles.statusLine} ${styles.statusLineInRow}`}>
            <span>{statusMessage}</span>
            <span className={styles.statusDots} aria-hidden>
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
            {props.elapsedLabel ? (
              <span className={styles.statusTiming}>
                {t('search.status.elapsed', { value: props.elapsedLabel })}
                {props.typicalTotalLabel ? ` · ${t('search.status.typicalTotal', { value: props.typicalTotalLabel })}` : ''}
                {props.overrunLabel
                  ? ` · ${t('search.status.longerThanUsual', { value: props.overrunLabel })}`
                  : props.etaLabel
                    ? ` · ${t('search.status.eta', { value: props.etaLabel })}`
                    : ''}
              </span>
            ) : null}
          </p>
          <Menu as="div" className={styles.menuWrap}>
            <MenuButton type="button" className={styles.menuTrigger} aria-label={t('search.action.more')}>
              <FiTool className={styles.menuTriggerIcon} aria-hidden />
            </MenuButton>
            <MenuItems className={styles.menuList}>
              <MenuItem>
                {({ close }) => (
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      close()
                      setShowDebug((prev) => !prev)
                    }}
                  >
                    <span>{showDebug ? t('search.debug.hide') : t('search.debug.show')}</span>
                  </button>
                )}
              </MenuItem>
            </MenuItems>
          </Menu>
        </div>
      ) : null}
      {showResultSummary ? (
        <div className={styles.statusRow}>
          <span className={styles.statusRowText}>{t('search.status.showingResults', { query: props.query })}</span>
          <Menu as="div" className={styles.menuWrap}>
            <MenuButton type="button" className={styles.menuTrigger} aria-label={t('search.action.more')}>
              <FiTool className={styles.menuTriggerIcon} aria-hidden />
            </MenuButton>
            <MenuItems className={styles.menuList}>
              <MenuItem disabled={props.isRerunningIntents || props.isRerunningArticles || props.isLoading}>
                {({ close, disabled }) => (
                  <button
                    type="button"
                    className={styles.menuItem}
                    disabled={disabled}
                    onClick={async () => {
                      close()
                      await props.onRerunIntents()
                    }}
                  >
                    <span className={styles.menuItemContent}>
                      <FiRefreshCw className={styles.menuItemIcon} aria-hidden />
                      <span>{props.isRerunningIntents ? t('search.action.rerunIntents.running') : t('search.action.rerunIntents')}</span>
                    </span>
                  </button>
                )}
              </MenuItem>
              <MenuItem>
                {({ close }) => (
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      close()
                      setShowDebug((prev) => !prev)
                    }}
                  >
                    <span>{showDebug ? t('search.debug.hide') : t('search.debug.show')}</span>
                  </button>
                )}
              </MenuItem>
            </MenuItems>
          </Menu>
        </div>
      ) : null}
      {showCorrectionHint && props.correctedQuery ? (
        <p className={styles.statusLine}>
          {t('search.status.includingResults', { query: props.correctedQuery })}{' '}
          <button type="button" className={styles.inlineButton} onClick={() => void props.onSearchOriginal()}>
            {t('search.status.searchOnlyFor', { query: props.requestedQuery })}
          </button>
        </p>
      ) : null}
      {props.error ? (
        <div className={styles.errorRow}>
          <p className={styles.error}>{props.error}</p>
          <Menu as="div" className={styles.menuWrap}>
            <MenuButton type="button" className={styles.menuTrigger} aria-label={t('search.action.more')}>
              <FiTool className={styles.menuTriggerIcon} aria-hidden />
            </MenuButton>
            <MenuItems className={styles.menuList}>
              <MenuItem disabled={props.isRerunningQuery || props.isLoading}>
                {({ close, disabled }) => (
                  <button
                    type="button"
                    className={styles.menuItem}
                    disabled={disabled}
                    onClick={async () => {
                      close()
                      await props.onRerunQuery()
                    }}
                  >
                    <span className={styles.menuItemContent}>
                      <FiRefreshCw className={styles.menuItemIcon} aria-hidden />
                      <span>{props.isRerunningQuery ? t('search.action.rerunQuery.running') : t('search.action.rerunQuery')}</span>
                    </span>
                  </button>
                )}
              </MenuItem>
              <MenuItem>
                {({ close }) => (
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      close()
                      setShowDebug((prev) => !prev)
                    }}
                  >
                    <span>{showDebug ? t('search.debug.hide') : t('search.debug.show')}</span>
                  </button>
                )}
              </MenuItem>
            </MenuItems>
          </Menu>
        </div>
      ) : null}
      {props.validationError ? (
        <div className={styles.errorRow}>
          <p className={styles.error}>{props.validationError}</p>
        </div>
      ) : null}

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
              placeholder={t('search.home.placeholder')}
              className={styles.homeInput}
            />
            <button type="submit" className={styles.submit}>
              {t('search.home.submit')}
            </button>
          </form>
          <div className={styles.suggestionsPanel}>
            {props.recent.length > 0 ? (
              <section className={styles.suggestionsSection}>
                <h2 className={styles.suggestionsTitle}>{t('search.home.recent')}</h2>
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
                  {props.isFirstTimeUser ? t('search.home.examples.first') : t('search.home.examples.returning')}
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

      {props.query && !hasResults && !props.isLoading ? (
        <div className={styles.noResultsRow}>
          <span className={styles.noResultsText}>{t('search.noResultsYet')}</span>
          <Menu as="div" className={styles.menuWrap}>
            <MenuButton type="button" className={styles.menuTrigger} aria-label={t('search.action.more')}>
              <FiTool className={styles.menuTriggerIcon} aria-hidden />
            </MenuButton>
            <MenuItems className={styles.menuList}>
              <MenuItem disabled={props.isRerunningQuery || props.isLoading}>
                {({ close, disabled }) => (
                  <button
                    type="button"
                    className={styles.menuItem}
                    disabled={disabled}
                    onClick={async () => {
                      close()
                      await props.onRerunQuery()
                    }}
                  >
                    <span className={styles.menuItemContent}>
                      <FiRefreshCw className={styles.menuItemIcon} aria-hidden />
                      <span>{props.isRerunningQuery ? t('search.action.rerunQuery.running') : t('search.action.rerunQuery')}</span>
                    </span>
                  </button>
                )}
              </MenuItem>
              <MenuItem>
                {({ close }) => (
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      close()
                      setShowDebug((prev) => !prev)
                    }}
                  >
                    <span>{showDebug ? t('search.debug.hide') : t('search.debug.show')}</span>
                  </button>
                )}
              </MenuItem>
            </MenuItems>
          </Menu>
        </div>
      ) : null}
      {showDebug ? (
        <section className={styles.debugPanel}>
          <div className={styles.debugHeader}>
            <p className={styles.debugTitle}>{t('search.debug.title')}</p>
            <button
              type="button"
              className={styles.debugCloseButton}
              onClick={() => setShowDebug(false)}
              aria-label={t('search.debug.hide')}
            >
              <FiX className={styles.debugCloseIcon} aria-hidden />
            </button>
          </div>
          <p className={styles.debugMeta}>
            {props.activeOrderId
              ? t('search.debug.order', { orderId: String(props.activeOrderId) })
              : t('search.debug.orderNone')}
          </p>
          {props.debugEvents.length === 0 ? (
            <p className={styles.debugEmpty}>{t('search.debug.empty')}</p>
          ) : (
            <ul className={styles.debugList}>
              {props.debugEvents.map((event, index) => (
                <li key={`${event.at}-${index}`} className={styles.debugItem}>
                  <span className={styles.debugItemTime}>{event.at}</span>
                  <span>{event.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {hasResults ? (
        <div className={styles.grid}>
          {props.queryIntents.map((intent) => {
            const isRegenerating = props.rerunningIntentIds.includes(intent.id)

            return (
              <section key={intent.id} className={styles.intentCard}>
                <div className={styles.intentHeader}>
                  <h2 className={styles.intentTitle}>{intent.intent}</h2>
                  <Menu as="div" className={styles.menuWrap}>
                    <MenuButton type="button" className={styles.menuTrigger} aria-label={t('search.action.more')}>
                      <FiTool className={styles.menuTriggerIcon} aria-hidden />
                    </MenuButton>
                    <MenuItems className={styles.menuList}>
                      <MenuItem disabled={props.isRerunningIntents || isRegenerating || props.isLoading}>
                        {({ close, disabled }) => (
                          <button
                            type="button"
                            className={styles.menuItem}
                            disabled={disabled}
                            onClick={async () => {
                              close()
                              await props.onRerunArticle(intent.id)
                            }}
                          >
                            <span className={styles.menuItemContent}>
                              <FiRefreshCw className={styles.menuItemIcon} aria-hidden />
                              <span>
                                {isRegenerating
                                  ? t('search.action.rerunArticles.running')
                                  : t('search.action.rerunArticles')}
                              </span>
                            </span>
                          </button>
                        )}
                      </MenuItem>
                    </MenuItems>
                  </Menu>
                </div>
                {intent.isLoading ? (
                  <p className={styles.intentStatus}>
                    <span>{t('search.intent.finalizing')}</span>
                    <span className={styles.statusDots} aria-hidden>
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </span>
                  </p>
                ) : null}
                {intent.isLoading && intent.articles.length === 0 ? (
                  <div className={styles.intentPlaceholder} aria-hidden>
                    <div className={styles.intentPlaceholderTitle} />
                    <div className={styles.intentPlaceholderLine} />
                    <div className={styles.intentPlaceholderLineShort} />
                  </div>
                ) : null}
                {intent.articles.length === 0 && !intent.isLoading ? <p>{t('search.intent.noAnswer')}</p> : null}
                <ul className={styles.articleList}>
                  {intent.articles.map((article) => (
                    <li key={article.id} className={styles.articleItem}>
                      <Link
                        to={`/content/${article.slug}?query=${encodeURIComponent(props.requestedQuery || props.query)}${props.language && props.language !== 'auto' ? `&lang=${encodeURIComponent(props.language)}` : ''}`}
                        className={styles.articleLink}
                      >
                        {article.title}
                      </Link>
                      <p className={styles.articleSnippet}>{article.summary}</p>
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
