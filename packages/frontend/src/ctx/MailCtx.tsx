import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { listThreads, streamMail } from '../lib/api/mail'
import type { MailStreamEvent } from '../lib/api/mail'

type MailToast = {
  id: number
  message: string
}

type MailContextValue = {
  totalUnreadReplies: number
  totalUnreadThreads: number
  streamError: string | null
  toasts: MailToast[]
  lastReplyEvent: { threadUid: string; replyId: number; at: number } | null
  dismissToast: (id: number) => void
  refreshUnread: () => Promise<void>
}

const MailCtx = createContext<MailContextValue | null>(null)

export function MailProvider({ children }: { children: ReactNode }) {
  const [totalUnreadReplies, setTotalUnreadReplies] = useState(0)
  const [totalUnreadThreads, setTotalUnreadThreads] = useState(0)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<MailToast[]>([])
  const [lastReplyEvent, setLastReplyEvent] = useState<{ threadUid: string; replyId: number; at: number } | null>(null)
  const nextToastIdRef = useRef(1)

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback((message: string) => {
    const id = nextToastIdRef.current
    nextToastIdRef.current += 1
    setToasts((current) => [...current.slice(-3), { id, message }])

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 5000)
  }, [])

  const refreshUnread = useCallback(async () => {
    const payload = await listThreads({ unread: true })
    setTotalUnreadReplies(payload.unread.totalUnreadReplies)
    setTotalUnreadThreads(payload.unread.totalUnreadThreads)
  }, [])

  useEffect(() => {
    void refreshUnread()

    let stopped = false
    let teardown: (() => void) | null = null
    let retryTimer: number | null = null

    const connect = () => {
      if (stopped) return

      teardown = streamMail({
        onEvent: (event: MailStreamEvent) => {
          setStreamError(null)
          if (event.type === 'mail.unread.changed') {
            setTotalUnreadReplies(event.totalUnreadReplies)
            setTotalUnreadThreads(event.totalUnreadThreads)
            return
          }

          if (event.type === 'mail.reply.created') {
            setLastReplyEvent({ threadUid: event.threadUid, replyId: event.replyId, at: Date.now() })
            pushToast(`New reply in thread ${event.threadUid.slice(0, 8)}`)
            return
          }

          if (event.type === 'mail.reply.failed') {
            pushToast(`Reply failed: ${event.message}`)
          }
        },
        onError: (error) => {
          setStreamError(error.message)
          if (teardown) {
            teardown()
            teardown = null
          }
          retryTimer = window.setTimeout(connect, 2000)
        },
      })
    }

    connect()

    return () => {
      stopped = true
      if (teardown) teardown()
      if (retryTimer != null) window.clearTimeout(retryTimer)
    }
  }, [pushToast, refreshUnread])

  const value = useMemo(
    () => ({
      totalUnreadReplies,
      totalUnreadThreads,
      streamError,
      toasts,
      lastReplyEvent,
      dismissToast,
      refreshUnread,
    }),
    [dismissToast, lastReplyEvent, refreshUnread, streamError, toasts, totalUnreadReplies, totalUnreadThreads]
  )

  return <MailCtx.Provider value={value}>{children}</MailCtx.Provider>
}

export function useMailCtx(): MailContextValue {
  const ctx = useContext(MailCtx)
  if (!ctx) {
    throw new Error('useMailCtx must be used within MailProvider')
  }
  return ctx
}
