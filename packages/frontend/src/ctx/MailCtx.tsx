import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { listThreads } from '../lib/api/mail'

type MailContextValue = {
  totalUnreadReplies: number
  totalUnreadThreads: number
  refreshUnread: () => Promise<void>
}

const MailCtx = createContext<MailContextValue | null>(null)

export function MailProvider({ children }: { children: ReactNode }) {
  const [totalUnreadReplies, setTotalUnreadReplies] = useState(0)
  const [totalUnreadThreads, setTotalUnreadThreads] = useState(0)

  const refreshUnread = async () => {
    const payload = await listThreads({ unread: true })
    setTotalUnreadReplies(payload.unread.totalUnreadReplies)
    setTotalUnreadThreads(payload.unread.totalUnreadThreads)
  }

  useEffect(() => {
    void refreshUnread()
    const interval = window.setInterval(() => {
      void refreshUnread()
    }, 15000)
    return () => {
      window.clearInterval(interval)
    }
  }, [])

  const value = useMemo(
    () => ({
      totalUnreadReplies,
      totalUnreadThreads,
      refreshUnread,
    }),
    [totalUnreadReplies, totalUnreadThreads]
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
