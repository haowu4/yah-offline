export type ParsedFiletypeOperators = {
  cleanQuery: string
  filetype: string | null
  operatorCount: number
  queryWithOperator: string
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeFiletypeToken(token: string): string {
  const trimmed = token.trim().toLowerCase().replace(/^[.]+/, "")
  if (!trimmed) return ""
  if (!/^[a-z0-9][a-z0-9_-]{0,15}$/.test(trimmed)) return ""
  return trimmed
}

export function parseFiletypeOperators(rawQuery: string): ParsedFiletypeOperators {
  const source = normalizeWhitespace(rawQuery)
  if (!source) {
    return {
      cleanQuery: "",
      filetype: null,
      operatorCount: 0,
      queryWithOperator: "",
    }
  }

  const tokens = source.split(" ")
  const cleanTokens: string[] = []
  const filetypes: string[] = []

  for (const token of tokens) {
    const match = token.match(/^filetype:(.+)$/i)
    if (!match) {
      cleanTokens.push(token)
      continue
    }
    const normalized = normalizeFiletypeToken(match[1] || "")
    if (!normalized) {
      cleanTokens.push(token)
      continue
    }
    filetypes.push(normalized)
  }

  const cleanQuery = normalizeWhitespace(cleanTokens.join(" "))
  const filetype = filetypes.length > 0 ? filetypes[filetypes.length - 1] : null
  const queryWithOperator = normalizeWhitespace(`${cleanQuery}${filetype ? ` filetype:${filetype}` : ""}`)

  return {
    cleanQuery,
    filetype,
    operatorCount: filetypes.length,
    queryWithOperator,
  }
}
