import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import { getContactIconUrl, listContacts, listThreads } from '../lib/api/mail'
import type { ApiMailContact, ApiMailThreadSummary } from '../lib/api/mail'
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

function toInboxSnippet(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function MailPage() {
  const { setBreadcrumbs } = useMailBreadcrumbs()
  const [params, setParams] = useSearchParams()
  const [contacts, setContacts] = useState<ApiMailContact[]>([])
  const [contactQuery, setContactQuery] = useState('')
  const [selectedContactSlug, setSelectedContactSlug] = useState('')
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
    document.title = unread ? 'Unread Mail | yah' : 'Mail Inbox | yah'
  }, [unread])

  const selectedContact = contacts.find((item) => item.slug === selectedContactSlug) ?? null
  const filteredContacts = contactQuery.trim()
    ? contacts.filter((item) => {
        const token = contactQuery.trim().toLowerCase()
        return item.name.toLowerCase().includes(token) || item.slug.toLowerCase().includes(token)
      })
    : contacts

  useEffect(() => {
    setBreadcrumbs([{ label: 'Mail', to: '/mail' }])
  }, [setBreadcrumbs])

  useEffect(() => {
    setSelectedContactSlug(contact)
    setContactQuery('')
  }, [contact])

  useEffect(() => {
    void listContacts()
      .then((payload) => {
        setContacts(payload.contacts)
      })
      .catch(() => {
        setContacts([])
      })
  }, [])

  useEffect(() => {
    let mounted = true
    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    void listThreads({
      contact: contact || undefined,
      from: from || undefined,
      to: to || undefined,
      keyword: keyword || undefined,
      unread,
      tzOffsetMinutes: new Date().getTimezoneOffset(),
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
            <div className={styles.contactPickerWrap}>
              <input type="hidden" name="contact" value={selectedContactSlug} />
              <Combobox
                value={selectedContact}
                onChange={(value: ApiMailContact | null) => {
                  setSelectedContactSlug(value?.slug ?? '')
                }}
                nullable
              >
                <div className={styles.comboboxShell}>
                  <ComboboxInput
                    className={styles.filterInput}
                    placeholder="All contacts"
                    displayValue={(item: ApiMailContact | null) => item?.name ?? ''}
                    onChange={(event) => {
                      setContactQuery(event.target.value)
                      if (event.target.value.trim() === '') {
                        setSelectedContactSlug('')
                      }
                    }}
                  />
                  <ComboboxOptions anchor="bottom start" className={styles.comboboxOptions}>
                    <ComboboxOption value={null} className={styles.comboboxOption}>
                      <span className={styles.contactOptionName}>All contacts</span>
                      <span className={styles.contactOptionSlug}>no contact filter</span>
                    </ComboboxOption>
                    {filteredContacts.map((item) => (
                      <ComboboxOption key={item.id} value={item} className={styles.comboboxOption}>
                        <span className={styles.contactOptionName}>{item.name}</span>
                        <span className={styles.contactOptionSlug}>{item.slug}</span>
                      </ComboboxOption>
                    ))}
                  </ComboboxOptions>
                </div>
              </Combobox>
            </div>
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
          <p className={styles.filterHint}>Date range is interpreted in your local timezone, and the end date is inclusive.</p>
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
              <div className={styles.rowSender}>
                <span className={styles.senderDotGroup}>
                  {thread.contacts.slice(0, 3).map((contact) => (
                    contact.iconLocation ? (
                      <img
                        key={contact.slug}
                        className={styles.senderIcon}
                        src={getContactIconUrl(contact.slug, contact.updatedAt)}
                        alt={contact.name}
                        title={contact.name}
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <span
                        key={contact.slug}
                        className={styles.senderDot}
                        style={{ background: contact.color }}
                        title={contact.name}
                      />
                    )
                  ))}
                </span>
                <span>{getSenderLabel(thread)}</span>
              </div>
              <div className={styles.rowMain}>
                <span className={styles.rowSubject}>{thread.title || '(untitled thread)'}</span>
                <span className={styles.rowSnippet}>
                  {thread.lastReplySnippet ? toInboxSnippet(thread.lastReplySnippet) : 'No messages yet'}
                </span>
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
  )
}
