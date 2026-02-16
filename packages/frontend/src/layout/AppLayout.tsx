import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import type { FormEvent } from 'react'
import styles from './AppLayout.module.css'

function getModeFromPath(pathname: string): 'search' | 'mail' {
  if (pathname.startsWith('/mail')) return 'mail'
  return 'search'
}

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const mode = getModeFromPath(location.pathname)
  const modeLabel = mode === 'search' ? 'Search' : 'Mail'

  const currentSearchInput = (() => {
    if (location.pathname === '/search') {
      const params = new URLSearchParams(location.search)
      return params.get('query') ?? ''
    }

    if (location.pathname.startsWith('/content/')) {
      const params = new URLSearchParams(location.search)
      return params.get('query') ?? ''
    }

    return ''
  })()
  const shouldShowNavSearch =
    !(location.pathname === '/search' && currentSearchInput.trim() === '')

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget as HTMLFormElement)
    const query = String(formData.get('query') ?? '').trim()
    if (!query) {
      navigate('/search')
      return
    }

    navigate(`/search?query=${encodeURIComponent(query)}`)
  }

  const selectMode = (target: 'search' | 'mail') => {
    if (target === mode) {
      setIsMenuOpen(false)
      return
    }

    setIsMenuOpen(false)
    if (target === 'search') {
      navigate('/search')
      return
    }

    navigate('/mail')
  }

  return (
    <div className={styles.appShell}>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link to="/" className={styles.brandLink}>
            <span className={styles.brandBadge}>Y</span>
            <strong className={styles.brandText}>yah</strong>
          </Link>

          {shouldShowNavSearch ? (
            <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
              <input
                key={`${location.pathname}:${location.search}`}
                name="query"
                defaultValue={currentSearchInput}
                placeholder="Search"
                className={styles.searchInput}
              />
            </form>
          ) : null}

          <div className={styles.spacer} />

          <div className={styles.menuWrap}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((current) => !current)}
              className={`${styles.menuButton} ${isMenuOpen ? styles.menuButtonOpen : ''}`}
            >
              <span>{modeLabel}</span>
              <span className={styles.menuChevron}>{isMenuOpen ? '▴' : '▾'}</span>
            </button>

            {isMenuOpen ? (
              <div className={styles.menu}>
                <button
                  type="button"
                  onClick={() => selectMode('search')}
                  className={`${styles.menuItem} ${mode === 'search' ? styles.menuItemActive : ''}`}
                >
                  <span>Search</span>
                </button>
                <button
                  type="button"
                  onClick={() => selectMode('mail')}
                  className={`${styles.menuItem} ${mode === 'mail' ? styles.menuItemActive : ''}`}
                >
                  <span>Mail</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
