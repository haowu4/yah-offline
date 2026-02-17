import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { listThreads } from '../lib/api/mail'
import type { ApiMailThreadSummary } from '../lib/api/mail'
import styles from './MailPage.module.css'

type LoadState = {
  isLoading: boolean
  error: string | null
  threads: ApiMailThreadSummary[]
}

export function MailPage() {
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

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Mail Threads</h1>

      <form
        className={styles.filters}
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
        <input name="contact" defaultValue={contact} placeholder="Contact slug" className={styles.input} />
        <input name="keyword" defaultValue={keyword} placeholder="Keyword" className={styles.input} />
        <input name="from" defaultValue={from} type="date" className={styles.input} />
        <input name="to" defaultValue={to} type="date" className={styles.input} />
        <label className={styles.checkboxLabel}>
          <input name="unread" type="checkbox" defaultChecked={unread} />
          <span>Unread only</span>
        </label>
        <button type="submit" className={styles.submit}>Filter</button>
      </form>

      <div className={styles.actions}>
        <Link to="/mail/thread/new">New thread</Link>
        <Link to="/mail/new-contact">New contact</Link>
        <Link to="/mail/contact">All contacts</Link>
      </div>

      {state.isLoading ? <p>Loading...</p> : null}
      {state.error ? <p className={styles.error}>{state.error}</p> : null}

      <ul className={styles.list}>
        {state.threads.map((thread) => (
          <li key={thread.threadUid} className={styles.item}>
            <Link to={`/mail/thread/${thread.threadUid}`} className={styles.threadLink}>
              {thread.title || '(untitled thread)'}
            </Link>
            <p className={styles.meta}>
              unread: {thread.unreadCount} | updated: {thread.updatedAt}
            </p>
            {thread.lastReplySnippet ? <p className={styles.snippet}>{thread.lastReplySnippet}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
