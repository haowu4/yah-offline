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

export type ApiGuideIndexItem = {
  slug: string
  title: string
  filename: string
}

export type ApiGuideDoc = {
  slug: string
  title: string
  markdown: string
}

export async function listGuideDocs(): Promise<{ docs: ApiGuideIndexItem[] }> {
  return apiFetch('/guide/index')
}

export async function getGuideDoc(slug: string): Promise<ApiGuideDoc> {
  return apiFetch(`/guide/${encodeURIComponent(slug)}`)
}
