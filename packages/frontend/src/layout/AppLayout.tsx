import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import type { FormEvent } from 'react'
import styles from './AppLayout.module.css'

type AppMode = 'search' | 'mail' | 'config'

function getModeFromPath(pathname: string): AppMode {
  if (pathname.startsWith('/mail')) return 'mail'
  if (pathname.startsWith('/config')) return 'config'
  return 'search'
}

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const mode = getModeFromPath(location.pathname)
  const modeLabel = mode === 'search' ? 'Search' : mode === 'mail' ? 'Mail' : 'Config'
  const modeOptions: Array<{
    id: AppMode
    label: string
  }> = [
    {
      id: 'search',
      label: 'Search',
    },
    {
      id: 'mail',
      label: 'Mail',
    },
    {
      id: 'config',
      label: 'Config',
    },
  ]

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
    mode !== 'config' && !(location.pathname === '/search' && currentSearchInput.trim() === '')

  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target)) return
      setIsMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isMenuOpen])

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

  const selectMode = (target: AppMode) => {
    if (target === mode) {
      setIsMenuOpen(false)
      return
    }

    setIsMenuOpen(false)
    if (target === 'search') {
      navigate('/search')
      return
    }

    if (target === 'config') {
      navigate('/config')
      return
    }

    navigate('/mail')
  }

  const brandTo = mode === 'mail' ? '/mail' : mode === 'config' ? '/config' : '/search'
  const mainClassName =
    mode === 'mail'
      ? `${styles.main} ${styles.mainMail}`
      : `${styles.main} ${styles.mainScroll}`

  return (
    <div className={styles.appShell}>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link to={brandTo} className={styles.brandLink}>
            <img src="/logo.png" alt="yah" className={styles.brandLogo} />
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
              <button type="submit" className={styles.searchSubmit}>
                Search
              </button>
            </form>
          ) : null}

          <div className={styles.spacer} />

          <div className={styles.menuWrap} ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              className={`${styles.menuButton} ${isMenuOpen ? styles.menuButtonOpen : ''}`}
            >
              <span className={styles.menuButtonText}>
                <small className={styles.menuButtonCaption}>App</small>
                <strong className={styles.menuButtonValue}>{modeLabel}</strong>
              </span>
              <span className={styles.menuChevron}>{isMenuOpen ? '▴' : '▾'}</span>
            </button>

            {isMenuOpen ? (
              <div className={styles.menu} role="menu" aria-label="App selection">
                <p className={styles.menuTitle}>App</p>
                {modeOptions.map((option) => {
                  const isActive = mode === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => selectMode(option.id)}
                      className={`${styles.menuItem} ${isActive ? styles.menuItemActive : ''}`}
                      role="menuitemradio"
                      aria-checked={isActive}
                    >
                      <span className={styles.menuItemText}>
                        <span className={styles.menuItemLabel}>{option.label}</span>
                      </span>
                      <span className={styles.menuItemMeta}>
                        <span className={`${styles.menuCheck} ${isActive ? styles.menuCheckVisible : ''}`}>✓</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className={mainClassName}>
        <Outlet />
      </main>
    </div>
  )
}
