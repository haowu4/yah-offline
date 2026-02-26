import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react'
import { FiCheck, FiChevronDown, FiGlobe } from 'react-icons/fi'
import { useLanguageCtx } from '../ctx/LanguageCtx'
import styles from './LanguagePicker.module.css'

type LanguagePickerProps = {
  className?: string
}

export function LanguagePicker(props: LanguagePickerProps) {
  const { language, options, setLanguage } = useLanguageCtx()
  const selected = options.find((option) => option.value === language) ?? options[0]

  return (
    <div className={`${styles.wrap} ${props.className ?? ''}`.trim()}>
      <Listbox value={selected.value} onChange={(value: string) => setLanguage({ language: value })}>
        <ListboxButton className={styles.button} aria-label="Search language">
          <FiGlobe className={styles.buttonIcon} aria-hidden="true" />
          <span className={styles.label}>Language</span>
          <span className={styles.value}>{selected.label}</span>
          <FiChevronDown className={styles.chevron} aria-hidden="true" />
        </ListboxButton>

        <ListboxOptions anchor="bottom end" className={styles.options}>
          {options.map((option) => (
            <ListboxOption key={option.value} value={option.value} className={styles.option}>
              {({ selected: isSelected, focus }) => (
                <div className={`${styles.optionInner} ${focus ? styles.optionFocus : ''}`}>
                  <span className={styles.optionLabel}>{option.label}</span>
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
