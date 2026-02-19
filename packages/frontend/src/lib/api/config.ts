const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export type ApiConfigItem = {
  key: string
  value: string
  description: string
}

export async function listConfigs(): Promise<{ configs: ApiConfigItem[] }> {
  return apiFetch('/config')
}

export async function createConfig(args: {
  key: string
  value: string
}): Promise<{ config: ApiConfigItem }> {
  return apiFetch('/config', {
    method: 'POST',
    body: JSON.stringify(args),
  })
}

export async function updateConfig(
  key: string,
  args: {
    value: string
  }
): Promise<{ config: ApiConfigItem }> {
  return apiFetch(`/config/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify(args),
  })
}

export async function deleteConfig(key: string): Promise<{ ok: boolean }> {
  return apiFetch(`/config/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  })
}
