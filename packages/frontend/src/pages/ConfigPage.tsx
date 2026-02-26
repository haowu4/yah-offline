import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  applyConfigPreset,
  createConfig,
  deleteConfig,
  getConfigPresetPreview,
  listConfigs,
  updateConfig,
  type ApiConfigPresetChange,
  type ApiConfigItem,
  type ConfigPresetName,
} from '../lib/api/config'
import styles from './ConfigPage.module.css'

function normalizeKey(value: string): string {
  return value.trim().toLowerCase()
}

export function ConfigPage() {
  const [configs, setConfigs] = useState<ApiConfigItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'key-asc' | 'key-desc'>('key-asc')

  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({})
  const [isApplyingPreset, setIsApplyingPreset] = useState<ConfigPresetName | null>(null)
  const [pendingPreset, setPendingPreset] = useState<ConfigPresetName | null>(null)
  const [isLoadingPresetPreview, setIsLoadingPresetPreview] = useState(false)
  const [pendingPresetPreview, setPendingPresetPreview] = useState<ApiConfigPresetChange[]>([])

  useEffect(() => {
    document.title = 'Config | yah'
  }, [])

  const fetchConfigs = async () => {
    setIsLoading(true)
    try {
      const payload = await listConfigs()
      setConfigs(payload.configs)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configs')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchConfigs()
  }, [])

  const filteredConfigs = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const matched = !keyword
      ? configs
      : configs.filter((item) => {
      const haystack = `${item.key} ${item.description}`.toLowerCase()
      return haystack.includes(keyword)
    })
    return [...matched].sort((a, b) => {
      if (sort === 'key-desc') {
        return b.key.localeCompare(a.key)
      }
      return a.key.localeCompare(b.key)
    })
  }, [configs, search, sort])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const key = normalizeKey(newKey)
    if (!key) {
      setError('Key is required')
      return
    }

    try {
      setIsCreating(true)
      const payload = await createConfig({
        key,
        value: newValue,
      })
      setConfigs((current) => [...current, payload.config].sort((a, b) => a.key.localeCompare(b.key)))
      setNewKey('')
      setNewValue('')
      setError(null)
      setNotice(`Created "${payload.config.key}"`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create config')
    } finally {
      setIsCreating(false)
    }
  }

  const startEditing = (item: ApiConfigItem) => {
    setEditingKey(item.key)
    setEditingValue(item.value)
  }

  const cancelEditing = () => {
    setEditingKey(null)
    setEditingValue('')
  }

  const handleSaveEdit = async (key: string) => {
    try {
      setIsSaving(true)
      const payload = await updateConfig(key, {
        value: editingValue,
      })
      setConfigs((current) =>
        current.map((item) => (item.key === key ? payload.config : item))
      )
      setError(null)
      setNotice(`Saved "${payload.config.key}"`)
      cancelEditing()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update config')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (key: string) => {
    try {
      await deleteConfig(key)
      setConfigs((current) => current.filter((item) => item.key !== key))
      setPendingDeleteKey(null)
      if (editingKey === key) {
        cancelEditing()
      }
      setError(null)
      setNotice(`Deleted "${key}"`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete config')
    }
  }

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const handleApplyPreset = async (preset: ConfigPresetName) => {
    try {
      setIsApplyingPreset(preset)
      await applyConfigPreset(preset)
      await fetchConfigs()
      setError(null)
      setNotice(`Applied preset "${preset}"`)
      setPendingPreset(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply preset')
    } finally {
      setIsApplyingPreset(null)
    }
  }

  const pendingPresetChanges = useMemo(() => {
    return pendingPresetPreview.filter((item) => item.willChange)
  }, [pendingPresetPreview])

  const handlePreviewPreset = async (preset: ConfigPresetName) => {
    try {
      setIsLoadingPresetPreview(true)
      const payload = await getConfigPresetPreview(preset)
      setPendingPreset(payload.preset)
      setPendingPresetPreview(payload.changes)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preset preview')
    } finally {
      setIsLoadingPresetPreview(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Config</h1>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {isLoading ? <p className={styles.status}>Loading configs...</p> : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>LLM Presets</h2>
        </div>
        <div className={styles.presetRow}>
          <button
            type="button"
            className={pendingPreset === 'openai' ? styles.button : styles.buttonSecondary}
            disabled={isApplyingPreset !== null || isLoadingPresetPreview}
            onClick={() => void handlePreviewPreset('openai')}
          >
            OpenAI
          </button>
          <button
            type="button"
            className={pendingPreset === 'zai' ? styles.button : styles.buttonSecondary}
            disabled={isApplyingPreset !== null || isLoadingPresetPreview}
            onClick={() => void handlePreviewPreset('zai')}
          >
            z.ai
          </button>
          <button
            type="button"
            className={pendingPreset === 'deepseek' ? styles.button : styles.buttonSecondary}
            disabled={isApplyingPreset !== null || isLoadingPresetPreview}
            onClick={() => void handlePreviewPreset('deepseek')}
          >
            DeepSeek
          </button>
          <button
            type="button"
            className={pendingPreset === 'moonshot' ? styles.button : styles.buttonSecondary}
            disabled={isApplyingPreset !== null || isLoadingPresetPreview}
            onClick={() => void handlePreviewPreset('moonshot')}
          >
            Moonshot
          </button>
        </div>
        {isLoadingPresetPreview ? <p className={styles.status}>Loading preset preview...</p> : null}
        {pendingPreset ? (
          <div className={styles.presetConfirm}>
            <p className={styles.presetConfirmTitle}>Confirm preset: {pendingPreset}</p>
            {pendingPresetChanges.length > 0 ? (
              <div className={styles.presetChangeList}>
                {pendingPresetChanges.map((item) => (
                  <div key={item.key} className={styles.presetChangeRow}>
                    <div className={styles.presetKey}>{item.key}</div>
                    <div className={styles.presetValues}>
                      <span className={styles.presetOld}>{item.currentValue || '(empty)'}</span>
                      <span className={styles.presetArrow}>{'->'}</span>
                      <span className={styles.presetNew}>{item.nextValue || '(empty)'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.status}>No changes needed for this preset.</p>
            )}
            <div className={styles.presetActions}>
              <button
                type="button"
                className={styles.button}
                disabled={isApplyingPreset !== null}
                onClick={() => void handleApplyPreset(pendingPreset)}
              >
                {isApplyingPreset === pendingPreset ? 'Saving...' : 'Save preset'}
              </button>
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={isApplyingPreset !== null}
                onClick={() => {
                  setPendingPreset(null)
                  setPendingPresetPreview([])
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>New Config</h2>
        </div>
        <form onSubmit={handleCreate} className={styles.createForm}>
          <label className={styles.field}>
            <span className={styles.label}>Key</span>
            <input
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
              placeholder="search.content_generation.model"
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Value</span>
            <input
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              placeholder="Config value"
              className={styles.input}
            />
          </label>

          <button type="submit" className={styles.button} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create config'}
          </button>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Existing Configs</h2>
          <div className={styles.controls}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search key or description"
              className={styles.searchInput}
            />
            {search ? (
              <button type="button" className={styles.buttonSecondary} onClick={() => setSearch('')}>
                Clear
              </button>
            ) : null}
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as 'key-asc' | 'key-desc')}
              className={styles.select}
            >
              <option value="key-asc">Key A-Z</option>
              <option value="key-desc">Key Z-A</option>
            </select>
          </div>
        </div>

        {!isLoading && filteredConfigs.length === 0 ? (
          <p className={styles.status}>{search ? `No configs match "${search}".` : 'No configs yet.'}</p>
        ) : null}

        {filteredConfigs.length > 0 ? (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <span>Key</span>
              <span>Description</span>
              <span>Value</span>
              <span>Actions</span>
            </div>
            {filteredConfigs.map((item) => {
              const isEditing = editingKey === item.key
              const isExpanded = Boolean(expandedKeys[item.key])
              const valuePreview =
                item.value.length > 140 && !isExpanded ? `${item.value.slice(0, 140)}...` : item.value
              const isDirty = isEditing && editingValue !== item.value

              return (
                <div key={item.key} className={styles.row}>
                  <div className={styles.cellKey}>{item.key}</div>
                  <div className={styles.cellDescription}>
                    {item.description || <span className={styles.placeholder}>No description</span>}
                  </div>
                  <div className={styles.cellValue}>
                    {isEditing ? (
                      <textarea
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        className={styles.textarea}
                      />
                    ) : (
                      <>
                        <pre className={styles.value}>{valuePreview}</pre>
                        {item.value.length > 140 ? (
                          <button
                            type="button"
                            className={styles.linkButton}
                            onClick={() => toggleExpanded(item.key)}
                          >
                            {isExpanded ? 'Collapse' : 'Expand'}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className={styles.cellActions}>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className={styles.buttonSecondary}
                          disabled={!isDirty || isSaving}
                          onClick={() => void handleSaveEdit(item.key)}
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" className={styles.buttonSecondary} onClick={cancelEditing}>
                          Discard
                        </button>
                      </>
                    ) : (
                      <button type="button" className={styles.buttonSecondary} onClick={() => startEditing(item)}>
                        Edit
                      </button>
                    )}

                    {pendingDeleteKey === item.key ? (
                      <>
                        <button
                          type="button"
                          className={styles.buttonDanger}
                          onClick={() => void handleDelete(item.key)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className={styles.buttonSecondary}
                          onClick={() => setPendingDeleteKey(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={styles.buttonDangerSoft}
                        onClick={() => setPendingDeleteKey(item.key)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>
    </div>
  )
}
