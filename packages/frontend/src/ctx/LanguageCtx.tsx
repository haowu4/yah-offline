import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'

export type LanguageOption = {
  value: string
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: 'auto' },
  { value: 'en' },
  { value: 'zh-CN' },
  { value: 'zh-TW' },
  { value: 'ja' },
  { value: 'ko' },
  { value: 'es' },
  { value: 'fr' },
  { value: 'de' },
]

type LanguageContextValue = {
  language: string
  options: LanguageOption[]
  setLanguage: (args: { language: string; replace?: boolean }) => void
}

const LanguageCtx = createContext<LanguageContextValue | null>(null)
const LANGUAGE_STORAGE_KEY = 'yah.language'

function readStoredLanguage(): string {
  if (typeof window === 'undefined') return 'auto'
  const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)?.trim()
  return value || 'auto'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [language, setLanguageState] = useState<string>(() => {
    const params = new URLSearchParams(location.search)
    const fromUrl = params.get('lang')?.trim()
    return fromUrl || readStoredLanguage()
  })

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const fromUrl = params.get('lang')?.trim()
    if (!fromUrl || fromUrl === language) return
    setLanguageState(fromUrl)
  }, [language, location.search])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  }, [language])

  const setLanguage = useCallback(
    (args: { language: string; replace?: boolean }) => {
      const normalized = args.language.trim() || 'auto'
      setLanguageState(normalized)
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
