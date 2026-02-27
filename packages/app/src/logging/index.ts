type LogLevel = "info" | "error"

type BaseEvent = Record<string, unknown> & {
  ts: string
  level: LogLevel
  event: string
}

type DebugEvent = Record<string, unknown> & {
  event: string
  level?: LogLevel
}

function nowIso(): string {
  return new Date().toISOString()
}

function toBool(value: unknown): boolean {
  if (typeof value !== "string") return false
  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true"
}

function sanitizeLinePart(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function ellipsis40(input: string): string {
  if (input.length <= 40) return input
  return `${input.slice(0, 40)}...`
}

export function createRequestId(): string {
  return `req_${Math.random().toString(36).slice(2, 10)}`
}

export function createCallId(): string {
  return `llm_${Math.random().toString(36).slice(2, 10)}`
}

export function isDebugEnabled(flagFromConfig?: boolean): boolean {
  if (typeof flagFromConfig === "boolean") return flagFromConfig
  return toBool(process.env.YAH_DEBUG)
}

export function logLine(level: LogLevel, message: string): void {
  const normalized = sanitizeLinePart(message)
  if (level === "error") {
    console.error(normalized)
    return
  }
  console.log(normalized)
}

export function logDebugJson(
  enabled: boolean,
  event: DebugEvent
): void {
  if (!enabled) return
  const payload: BaseEvent = {
    ts: nowIso(),
    level: event.level ?? "info",
    ...event,
  }
  const output = JSON.stringify(payload)
  if (payload.level === "error") {
    console.error(output)
    return
  }
  console.log(output)
}

export function errorDetails(error: unknown): { errorName: string; errorMessage: string } {
  if (error instanceof Error) {
    return {
      errorName: error.name || "Error",
      errorMessage: error.message || "Unknown error",
    }
  }
  return {
    errorName: "Error",
    errorMessage: typeof error === "string" ? error : "Unknown error",
  }
}

function normalizeForStorage(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[max-depth]"
  if (value === null || value === undefined) return value
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => normalizeForStorage(item, depth + 1))
  if (typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = normalizeForStorage(child, depth + 1)
    }
    return output
  }
  return String(value)
}

export function errorStorageDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const anyError = error as Error & {
      code?: unknown
      status?: unknown
      type?: unknown
      cause?: unknown
      llmDetails?: unknown
      response?: unknown
      error?: unknown
    }
    return {
      name: error.name || "Error",
      message: error.message || "Unknown error",
      code: normalizeForStorage(anyError.code),
      status: normalizeForStorage(anyError.status),
      type: normalizeForStorage(anyError.type),
      cause: normalizeForStorage(anyError.cause),
      llmDetails: normalizeForStorage(anyError.llmDetails),
      response: normalizeForStorage(anyError.response),
      providerError: normalizeForStorage(anyError.error),
    }
  }

  return {
    value: normalizeForStorage(error),
  }
}
