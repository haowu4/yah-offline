import styles from './ColorPicker.module.css'

type ColorPickerProps = {
  id?: string
  name: string
  value: string
  onChange: (value: string) => void
}

function normalizeHexColor(value: string): string {
  const trimmed = value.trim().toLowerCase()
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  const match = normalized.match(/^#([0-9a-f]{6})$/)
  if (!match) return '#6b7280'
  return `#${match[1]}`
}

export function ColorPicker({ id, name, value, onChange }: ColorPickerProps) {
  const normalized = normalizeHexColor(value)
  const swatchId = id ? `${id}-swatch` : undefined

  return (
    <div className={styles.root}>
      <input
        id={swatchId}
        className={styles.swatch}
        type="color"
        value={normalized}
        onChange={(event) => onChange(normalizeHexColor(event.target.value))}
        aria-label="Pick color"
      />
      <input
        id={id}
        className={styles.value}
        name={name}
        value={normalized}
        onChange={(event) => onChange(normalizeHexColor(event.target.value))}
        spellCheck={false}
        placeholder="#6b7280"
      />
    </div>
  )
}
