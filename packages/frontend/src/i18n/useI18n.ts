import { useMemo } from 'react'
import { useLanguageCtx } from '../ctx/LanguageCtx'
import { messages, type Locale } from './messages'

function resolveLocale(language: string): Locale {
  const normalized = language.trim().toLowerCase()
  if (!normalized || normalized === 'auto') {
    const browserLanguage =
      typeof navigator !== 'undefined' && typeof navigator.language === 'string'
        ? navigator.language.trim().toLowerCase()
        : ''
    if (browserLanguage.startsWith('zh-tw') || browserLanguage.startsWith('zh-hk')) return 'zh-TW'
    if (browserLanguage.startsWith('zh')) return 'zh-CN'
    if (browserLanguage.startsWith('ja')) return 'ja'
    if (browserLanguage.startsWith('ko')) return 'ko'
    if (browserLanguage.startsWith('es')) return 'es'
    if (browserLanguage.startsWith('fr')) return 'fr'
    if (browserLanguage.startsWith('de')) return 'de'
    return 'en'
  }
  if (normalized === 'zh-tw' || normalized === 'zh-hk') return 'zh-TW'
  if (normalized.startsWith('zh')) return 'zh-CN'
  if (normalized.startsWith('ja')) return 'ja'
  if (normalized.startsWith('ko')) return 'ko'
  if (normalized.startsWith('es')) return 'es'
  if (normalized.startsWith('fr')) return 'fr'
  if (normalized.startsWith('de')) return 'de'
  return 'en'
}

export function useI18n() {
  const { language } = useLanguageCtx()
  const locale = resolveLocale(language)

  const t = useMemo(() => {
    return (key: string, vars?: Record<string, string | number>): string => {
      const dict = messages[locale]
      const fallback = messages.en
      let template = dict[key] ?? fallback[key] ?? key
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          template = template.replaceAll(`{${name}}`, String(value))
        }
      }
      return template
    }
  }, [locale])

  return {
    locale,
    t,
  }
}
