import { createContext, useContext, useMemo, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { FiPlus } from 'react-icons/fi'
import styles from './MailLayout.module.css'
import { useMailCtx } from '../ctx/MailCtx'

export type MailBreadcrumb = {
  label: string
  to?: string
}

type MailBreadcrumbContextValue = {
  breadcrumbs: MailBreadcrumb[]
  setBreadcrumbs: (items: MailBreadcrumb[]) => void
}

const MailBreadcrumbCtx = createContext<MailBreadcrumbContextValue | null>(null)

export function MailLayout() {
  const location = useLocation()
  const mail = useMailCtx()
  const [breadcrumbs, setBreadcrumbs] = useState<MailBreadcrumb[]>([
    { label: 'Mail', to: '/mail' },
  ])

  const value = useMemo(
    () => ({
      breadcrumbs,
      setBreadcrumbs,
    }),
    [breadcrumbs]
  )

  return (
    <MailBreadcrumbCtx.Provider value={value}>
      <div className={styles.root}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <ol className={styles.crumbList}>
            {breadcrumbs.map((item, index) => {
              const isLast = index === breadcrumbs.length - 1
              return (
                <li key={`${item.label}-${index}`} className={styles.crumbItem}>
                  {item.to && !isLast ? (
                    <Link to={item.to} className={styles.crumbLink}>
                      {item.label}
                    </Link>
                  ) : (
                    <span className={styles.crumbCurrent} aria-current="page">
                      {item.label}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>
        <div className={styles.shell}>
          <aside className={styles.sidebar}>
            <Link to="/mail/thread/new" className={styles.actionButton}>
              <span className={styles.actionLabel}>New Thread</span>
              <span className={styles.actionIcon} aria-hidden>
                <FiPlus />
              </span>
            </Link>
            <nav className={styles.navList}>
              <Link
                className={`${styles.navItem} ${!location.search.includes('unread=1') ? styles.navItemActive : ''}`}
                to="/mail"
              >
                Inbox
              </Link>
              <Link
                className={`${styles.navItem} ${location.pathname === '/mail' && location.search.includes('unread=1') ? styles.navItemActive : ''}`}
                to="/mail?unread=1"
              >
                Unread ({mail.totalUnreadThreads})
              </Link>
            </nav>
          </aside>
          <main className={styles.main}>
            <Outlet />
          </main>
        </div>
      </div>
    </MailBreadcrumbCtx.Provider>
  )
}

export function useMailBreadcrumbs(): MailBreadcrumbContextValue {
  const ctx = useContext(MailBreadcrumbCtx)
  if (!ctx) {
    throw new Error('useMailBreadcrumbs must be used inside MailLayout')
  }
  return ctx
}
