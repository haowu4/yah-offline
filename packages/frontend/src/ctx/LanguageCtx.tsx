import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'

export type LanguageOption = {
  value: string
  label: string
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'zh-TW', label: 'Chinese (Traditional)' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
]

type LanguageContextValue = {
  language: string
  options: LanguageOption[]
  setLanguage: (args: { language: string; replace?: boolean }) => void
}

const LanguageCtx = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()

  const language = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('lang')?.trim() || 'auto'
  }, [location.search])

  const setLanguage = useCallback(
    (args: { language: string; replace?: boolean }) => {
      const normalized = args.language.trim() || 'auto'
      const params = new URLSearchParams(location.search)

      if (normalized === 'auto') {
        params.delete('lang')
      } else {
        params.set('lang', normalized)
      }

      const nextQuery = params.toString()
      navigate(
        {
          pathname: location.pathname,
          search: nextQuery ? `?${nextQuery}` : '',
        },
        { replace: args.replace ?? false },
      )
    },
    [location.pathname, location.search, navigate],
  )

  const value = useMemo(
    () => ({
      language,
      options: LANGUAGE_OPTIONS,
      setLanguage,
    }),
    [language, setLanguage],
  )

  return <LanguageCtx.Provider value={value}>{children}</LanguageCtx.Provider>
}

export function useLanguageCtx() {
  const ctx = useContext(LanguageCtx)
  if (!ctx) {
    throw new Error('useLanguageCtx must be used within LanguageProvider')
  }
  return ctx
}
