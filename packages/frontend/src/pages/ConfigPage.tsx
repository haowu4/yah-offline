import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  applyConfigPreset,
  createConfig,
  deleteConfig,
  listConfigs,
  updateConfig,
  type ApiConfigItem,
  type ConfigPresetName,
} from '../lib/api/config'
import styles from './ConfigPage.module.css'

function normalizeKey(value: string): string {
  return value.trim().toLowerCase()
}

const OPENAI_MODELS = [
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5.2-chat-latest',
  'gpt-5.1-chat-latest',
  'gpt-5-chat-latest',
  'gpt-5.2-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex',
  'gpt-5-codex',
  'gpt-5.2-pro',
  'gpt-5-pro',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o',
  'gpt-4o-2024-05-13',
  'gpt-4o-mini',
]

const ZAI_MODELS = [
  'GLM-5',
  'GLM-5-Code',
  'GLM-4.7',
  'GLM-4.7-FlashX',
  'GLM-4.6',
  'GLM-4.5',
  'GLM-4.5-X',
  'GLM-4.5-Air',
  'GLM-4.5-AirX',
  'GLM-4-32B-0414-128K',
  'GLM-4.7-Flash',
  'GLM-4.5-Flash',
]

const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner']

const MOONSHOT_MODELS = ['kimi-k2.5', 'kimi-k2-turbo-preview', 'kimi-k2-thinking', 'kimi-k2-thinking-turbo']

const PRESET_PLANS: Record<ConfigPresetName, Record<string, string>> = {
  openai: {
    'llm.models': JSON.stringify(OPENAI_MODELS),
    'mail.default_model': 'gpt-5.2-chat-latest',
    'mail.summary_model': 'gpt-5-mini',
    'search.content_generation.model': 'gpt-5.2-chat-latest',
    'search.intent_resolve.model': 'gpt-5-mini',
    'search.spelling_correction.model': 'gpt-5-mini',
    'llm.baseurl': '',
    'llm.apikey.env_name': 'OPENAI_API_KEY',
    'llm.apikey.keychain_name': 'openai/default',
  },
  zai: {
    'llm.models': JSON.stringify(ZAI_MODELS),
    'mail.default_model': 'GLM-4.7',
    'mail.summary_model': 'GLM-4.7-FlashX',
    'search.content_generation.model': 'GLM-4.7',
    'search.intent_resolve.model': 'GLM-4.7-FlashX',
    'search.spelling_correction.model': 'GLM-4.7-FlashX',
    'llm.baseurl': 'https://api.z.ai/api/paas/v4/',
    'llm.apikey.env_name': 'ZAI_API_KEY',
    'llm.apikey.keychain_name': 'zai/default',
  },
  deepseek: {
    'llm.models': JSON.stringify(DEEPSEEK_MODELS),
    'mail.default_model': 'deepseek-chat',
    'mail.summary_model': 'deepseek-chat',
    'search.content_generation.model': 'deepseek-chat',
    'search.intent_resolve.model': 'deepseek-chat',
    'search.spelling_correction.model': 'deepseek-chat',
    'llm.baseurl': 'https://api.deepseek.com/v1',
    'llm.apikey.env_name': 'DEEPSEEK_API_KEY',
    'llm.apikey.keychain_name': 'deepseek/default',
  },
  moonshot: {
    'llm.models': JSON.stringify(MOONSHOT_MODELS),
    'mail.default_model': 'kimi-k2.5',
    'mail.summary_model': 'kimi-k2-turbo-preview',
    'search.content_generation.model': 'kimi-k2.5',
    'search.intent_resolve.model': 'kimi-k2-turbo-preview',
    'search.spelling_correction.model': 'kimi-k2-turbo-preview',
    'llm.baseurl': 'https://api.moonshot.ai/v1',
    'llm.apikey.env_name': 'MOONSHOT_API_KEY',
    'llm.apikey.keychain_name': 'moonshot/default',
  },
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

  const configValueByKey = useMemo(() => {
    const map: Record<string, string> = {}
    for (const item of configs) {
      map[item.key] = item.value
    }
    return map
  }, [configs])

  const pendingPresetChanges = useMemo(() => {
    if (!pendingPreset) return []
    const target = PRESET_PLANS[pendingPreset]
    return Object.entries(target)
      .map(([key, nextValue]) => ({
        key,
        currentValue: configValueByKey[key] ?? '',
        nextValue,
      }))
      .filter((item) => item.currentValue !== item.nextValue)
  }, [configValueByKey, pendingPreset])

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
            className={styles.button}
            disabled={isApplyingPreset !== null}
            onClick={() => void handleApplyPreset('openai')}
          >
            {isApplyingPreset === 'openai' ? 'Applying...' : 'OpenAI'}
          </button>
          <button
            type="button"
            className={styles.buttonSecondary}
            disabled={isApplyingPreset !== null}
            onClick={() => void handleApplyPreset('zai')}
          >
            {isApplyingPreset === 'zai' ? 'Applying...' : 'z.ai'}
          </button>
          <button
            type="button"
            className={styles.buttonSecondary}
            disabled={isApplyingPreset !== null}
            onClick={() => void handleApplyPreset('deepseek')}
          >
            {isApplyingPreset === 'deepseek' ? 'Applying...' : 'DeepSeek'}
          </button>
          <button
            type="button"
            className={styles.buttonSecondary}
            disabled={isApplyingPreset !== null}
            onClick={() => void handleApplyPreset('moonshot')}
          >
            {isApplyingPreset === 'moonshot' ? 'Applying...' : 'Moonshot'}
          </button>
        </div>
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
              placeholder="mail.default_model"
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
