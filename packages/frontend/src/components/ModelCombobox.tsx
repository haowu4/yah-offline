import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import styles from './ModelCombobox.module.css'

type ModelComboboxProps = {
  id: string
  name: string
  value: string
  options: string[]
  placeholder?: string
  inputClassName?: string
  onChange: (value: string) => void
}

export function ModelCombobox(props: ModelComboboxProps) {
  const query = props.value.trim().toLowerCase()
  const filtered = query
    ? props.options.filter((option) => option.toLowerCase().includes(query))
    : props.options

  return (
    <Combobox value={props.value} onChange={(value) => props.onChange(value ?? '')}>
      <div className={styles.wrap}>
        <ComboboxInput
          id={props.id}
          name={props.name}
          className={props.inputClassName}
          displayValue={(value: string) => value ?? ''}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.placeholder}
        />
        {filtered.length > 0 ? (
          <ComboboxOptions className={styles.options}>
            {filtered.map((option) => (
              <ComboboxOption key={option} value={option}>
                {({ active }) => (
                  <span className={`${styles.option} ${active ? styles.optionActive : ''}`}>{option}</span>
                )}
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        ) : null}
      </div>
    </Combobox>
  )
}
