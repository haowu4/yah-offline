import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react'
import { FiCheck, FiChevronDown, FiGlobe } from 'react-icons/fi'
import { useLanguageCtx } from '../ctx/LanguageCtx'
import { useI18n } from '../i18n/useI18n'
import styles from './LanguagePicker.module.css'

const LANGUAGE_AUTONYMS: Record<string, string> = {
  auto: 'Auto',
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
}

type LanguagePickerProps = {
  className?: string
}

export function LanguagePicker(props: LanguagePickerProps) {
  const { t } = useI18n()
  const { language, options, setLanguage } = useLanguageCtx()
  const selected = options.find((option) => option.value === language) ?? options[0]
  const labelFor = (value: string) => LANGUAGE_AUTONYMS[value] || value

  return (
    <div className={`${styles.wrap} ${props.className ?? ''}`.trim()}>
      <Listbox value={selected.value} onChange={(value: string) => setLanguage({ language: value })}>
        <ListboxButton className={styles.button} aria-label={t('language.aria')}>
          <FiGlobe className={styles.buttonIcon} aria-hidden="true" />
          <span className={styles.label}>{t('language.label')}</span>
          <span className={styles.value}>{labelFor(selected.value)}</span>
          <FiChevronDown className={styles.chevron} aria-hidden="true" />
        </ListboxButton>

        <ListboxOptions anchor="bottom end" className={styles.options}>
          {options.map((option) => (
            <ListboxOption key={option.value} value={option.value} className={styles.option}>
              {({ selected: isSelected, focus }) => (
                <div className={`${styles.optionInner} ${focus ? styles.optionFocus : ''}`}>
                  <span className={styles.optionLabel}>{labelFor(option.value)}</span>
                  <span className={styles.optionMeta}>{option.value}</span>
                  <FiCheck className={`${styles.check} ${isSelected ? styles.checkVisible : ''}`} />
                </div>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </div>
  )
}
