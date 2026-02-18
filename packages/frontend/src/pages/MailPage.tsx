import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { listThreads } from '../lib/api/mail'
import type { ApiMailThreadSummary } from '../lib/api/mail'
import { useMailBreadcrumbs } from '../layout/MailLayout'
import styles from './MailPage.module.css'

type LoadState = {
  isLoading: boolean
  error: string | null
  threads: ApiMailThreadSummary[]
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

function getSenderLabel(thread: ApiMailThreadSummary): string {
  if (thread.contacts.length === 0) return 'No contact'
  return thread.contacts.map((contact) => contact.name).join(', ')
}

export function MailPage() {
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState<LoadState>({
    isLoading: true,
    error: null,
    threads: [],
  })

  const contact = params.get('contact') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const keyword = params.get('keyword') ?? ''
  const unread = params.get('unread') === '1'

  useEffect(() => {
    setBreadcrumbs([{ label: 'Mail', to: '/mail' }])
  }, [setBreadcrumbs])

  useEffect(() => {
    let mounted = true
    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    void listThreads({
      contact: contact || undefined,
      from: from || undefined,
      to: to || undefined,
      keyword: keyword || undefined,
      unread,
    })
      .then((payload) => {
        if (!mounted) return
        setState({ isLoading: false, error: null, threads: payload.threads })
      })
      .catch((error: unknown) => {
        if (!mounted) return
        setState({
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load threads',
          threads: [],
        })
      })

    return () => {
      mounted = false
    }
  }, [contact, from, keyword, to, unread])

  const unreadCount = useMemo(
    () => state.threads.reduce((sum, thread) => sum + thread.unreadCount, 0),
    [state.threads]
  )

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <Link to="/mail/thread/new" className={styles.composeButton}>
          Compose
        </Link>
        <nav className={styles.navList}>
          <Link className={`${styles.navItem} ${!unread ? styles.navItemActive : ''}`} to="/mail">
            Inbox
          </Link>
          <Link className={`${styles.navItem} ${unread ? styles.navItemActive : ''}`} to="/mail?unread=1">
            Unread ({unreadCount})
          </Link>
          <Link className={styles.navItem} to="/mail/contact">
            Contacts
          </Link>
          <Link className={styles.navItem} to="/mail/new-contact">
            New Contact
          </Link>
        </nav>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>Mail</h1>
          <form
            className={styles.searchRow}
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              const next = new URLSearchParams()
              const nextContact = String(form.get('contact') ?? '').trim()
              const nextFrom = String(form.get('from') ?? '').trim()
              const nextTo = String(form.get('to') ?? '').trim()
              const nextKeyword = String(form.get('keyword') ?? '').trim()
              const nextUnread = form.get('unread') === 'on'

              if (nextContact) next.set('contact', nextContact)
              if (nextFrom) next.set('from', nextFrom)
              if (nextTo) next.set('to', nextTo)
              if (nextKeyword) next.set('keyword', nextKeyword)
              if (nextUnread) next.set('unread', '1')

              setParams(next)
            }}
          >
            <input
              name="keyword"
              defaultValue={keyword}
              placeholder="Search mail"
              className={styles.searchInput}
            />
            <input name="contact" defaultValue={contact} placeholder="Contact" className={styles.filterInput} />
            <input name="from" defaultValue={from} type="date" className={styles.filterInput} />
            <input name="to" defaultValue={to} type="date" className={styles.filterInput} />
            <label className={styles.checkboxLabel}>
              <input name="unread" type="checkbox" defaultChecked={unread} />
              <span>Unread</span>
            </label>
            <button type="submit" className={styles.filterButton}>
              Filter
            </button>
          </form>
        </header>

        {state.error ? <p className={styles.error}>{state.error}</p> : null}
        {state.isLoading ? <p className={styles.status}>Loading threads...</p> : null}

        <div className={styles.listWrap}>
          {state.threads.map((thread) => (
            <Link
              to={`/mail/thread/${thread.threadUid}`}
              key={thread.threadUid}
              className={`${styles.row} ${thread.unreadCount > 0 ? styles.rowUnread : ''}`}
            >
              <div className={styles.rowSender}>{getSenderLabel(thread)}</div>
              <div className={styles.rowMain}>
                <span className={styles.rowSubject}>{thread.title || '(untitled thread)'}</span>
                <span className={styles.rowSnippet}>{thread.lastReplySnippet || 'No messages yet'}</span>
              </div>
              <div className={styles.rowMeta}>
                {thread.unreadCount > 0 ? <span className={styles.unreadBadge}>{thread.unreadCount}</span> : null}
                <span>{formatDate(thread.lastReplyAt || thread.updatedAt)}</span>
              </div>
            </Link>
          ))}
          {!state.isLoading && state.threads.length === 0 ? (
            <div className={styles.empty}>No threads match this filter.</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
