import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createConfig,
  deleteConfig,
  listConfigs,
  updateConfig,
  type ApiConfigItem,
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
  const [newDescription, setNewDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [editingDescription, setEditingDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({})

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
        description: newDescription,
      })
      setConfigs((current) => [...current, payload.config].sort((a, b) => a.key.localeCompare(b.key)))
      setNewKey('')
      setNewValue('')
      setNewDescription('')
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
    setEditingDescription(item.description)
  }

  const cancelEditing = () => {
    setEditingKey(null)
    setEditingValue('')
    setEditingDescription('')
  }

  const handleSaveEdit = async (key: string) => {
    try {
      setIsSaving(true)
      const payload = await updateConfig(key, {
        value: editingValue,
        description: editingDescription,
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
          <h2 className={styles.sectionTitle}>New Config</h2>
        </div>
        <form onSubmit={handleCreate} className={styles.createForm}>
          <label className={styles.field}>
            <span className={styles.label}>Key</span>
            <input
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
              placeholder="mail.default_model"
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Description</span>
            <input
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder="What this key controls"
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
              const isDirty = isEditing && (editingValue !== item.value || editingDescription !== item.description)

              return (
                <div key={item.key} className={styles.row}>
                  <div className={styles.cellKey}>{item.key}</div>
                  <div className={styles.cellDescription}>
                    {isEditing ? (
                      <input
                        value={editingDescription}
                        onChange={(event) => setEditingDescription(event.target.value)}
                        className={styles.input}
                      />
                    ) : (
                      item.description || <span className={styles.placeholder}>No description</span>
                    )}
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
