import { createContext, useContext, useMemo, useState } from 'react'
import { Link, Outlet } from 'react-router'
import styles from './MailLayout.module.css'

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
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1
            return (
              <span key={`${item.label}-${index}`} className={styles.crumbWrap}>
                {item.to && !isLast ? (
                  <Link to={item.to} className={styles.crumbLink}>
                    {item.label}
                  </Link>
                ) : (
                  <span className={styles.crumbCurrent}>{item.label}</span>
                )}
                {!isLast ? <span className={styles.sep}>/</span> : null}
              </span>
            )
          })}
        </nav>
        <Outlet />
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
