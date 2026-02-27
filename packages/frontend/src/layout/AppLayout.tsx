import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import type { FormEvent } from 'react'
import { useLanguageCtx } from '../ctx/LanguageCtx'
import { LanguagePicker } from '../components/LanguagePicker'
import { useI18n } from '../i18n/useI18n'
import styles from './AppLayout.module.css'

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { language: currentLanguage } = useLanguageCtx()
  const { t } = useI18n()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const isConfigPage = location.pathname.startsWith('/config')
  const isOrderLogsPage = location.pathname.startsWith('/orders')
  const isLLMFailuresPage = location.pathname.startsWith('/llm/failures')

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
    !isConfigPage && !isOrderLogsPage && !isLLMFailuresPage && !(location.pathname === '/search' && currentSearchInput.trim() === '')

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

    const params = new URLSearchParams()
    params.set('query', query)
    if (currentLanguage !== 'auto') {
      params.set('lang', currentLanguage)
    }
    navigate(`/search?${params.toString()}`)
  }

  const goToConfig = () => {
    setIsMenuOpen(false)
    navigate('/config')
  }

  const goToLLMFailures = () => {
    setIsMenuOpen(false)
    navigate('/llm/failures')
  }

  const goToOrderLogs = () => {
    setIsMenuOpen(false)
    navigate('/orders')
  }

  const brandTo = '/search'
  const mainClassName = styles.main

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
                placeholder={t('layout.search.placeholder')}
                className={styles.searchInput}
              />
              <button type="submit" className={styles.searchSubmit}>
                {t('layout.search.submit')}
              </button>
            </form>
          ) : null}

          <div className={styles.spacer} />

          <LanguagePicker className={styles.languageControl} />

          <div className={styles.menuWrap} ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-label={t('layout.menu.open')}
              className={`${styles.menuButton} ${isMenuOpen ? styles.menuButtonOpen : ''}`}
            >
              <span className={styles.menuIcon} aria-hidden="true">
                ☰
              </span>
              <span className={styles.menuChevron}>{isMenuOpen ? '▴' : '▾'}</span>
            </button>

            {isMenuOpen ? (
              <div className={styles.menu} role="menu" aria-label={t('layout.menu.title')}>
                <p className={styles.menuTitle}>{t('layout.menu.title')}</p>
                <button
                  type="button"
                  onClick={goToConfig}
                  className={`${styles.menuItem} ${isConfigPage ? styles.menuItemActive : ''}`}
                  role="menuitem"
                >
                  <span className={styles.menuItemText}>
                    <span className={styles.menuItemLabel}>{t('layout.menu.config')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={goToOrderLogs}
                  className={`${styles.menuItem} ${isOrderLogsPage ? styles.menuItemActive : ''}`}
                  role="menuitem"
                >
                  <span className={styles.menuItemText}>
                    <span className={styles.menuItemLabel}>{t('layout.menu.orders')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={goToLLMFailures}
                  className={`${styles.menuItem} ${isLLMFailuresPage ? styles.menuItemActive : ''}`}
                  role="menuitem"
                >
                  <span className={styles.menuItemText}>
                    <span className={styles.menuItemLabel}>{t('layout.menu.llmFailures')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  role="menuitem"
                  disabled
                  aria-disabled="true"
                >
                  <span className={styles.menuItemText}>
                    <span className={styles.menuItemLabel}>{t('layout.menu.guides')}</span>
                  </span>
                  <span className={styles.menuItemMeta}>
                    <span className={styles.menuMetaBadge}>{t('layout.menu.soon')}</span>
                  </span>
                </button>
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
