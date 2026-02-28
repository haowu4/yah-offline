import OpenAI from "openai"
import { AppCtx } from "../../appCtx.js"
import { logDebugJson, logLine } from "../../logging/index.js"
import {
  AbstractMagicApi,
  MagicImageResult,
  MagicQuality,
  MagicSearchArticleResult,
  MagicSearchIntentResult,
} from "../api.js"

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

function extractJsonObjectText(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  if (text.startsWith("{") && text.endsWith("}")) return text

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) {
    const candidate = fencedMatch[1].trim()
    if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate
  }

  const firstBrace = text.indexOf("{")
  const lastBrace = text.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim()
  }
  return null
}

function getChatOutputText(response: unknown): string {
  const anyResponse = response as { choices?: Array<{ message?: { content?: unknown } }> } | null
  const content = anyResponse?.choices?.[0]?.message?.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => (typeof part === "object" && part && "text" in part ? String((part as { text?: unknown }).text ?? "") : ""))
      .filter(Boolean)
    return textParts.join("\n")
  }
  throw new Error("Magic response did not contain chat completion content")
}

function getToolCallArgumentsText(response: unknown): string | null {
  const anyResponse = response as {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{
          function?: {
            arguments?: unknown
          }
        }>
      }
    }>
  } | null

  const args = anyResponse?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
  if (typeof args === "string" && args.trim()) return args
  if (args && typeof args === "object") {
    try {
      return JSON.stringify(args)
    } catch {
      return null
    }
  }
  return null
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function normalizeArticlePayload(
  parsed: unknown,
  fallbackIntent: string
): {
  title: string
  slug: string
  content: string
  recommendations: Array<{ title: string; summary: string }>
} {
  const fallbackTitle = fallbackIntent.trim() || "Untitled"
  const fallback = {
    title: fallbackTitle,
    slug: slugify(fallbackTitle),
    content: "",
    recommendations: [] as Array<{ title: string; summary: string }>,
  }

  if (!parsed || typeof parsed !== "object") return fallback
  const top = parsed as Record<string, unknown>

  const normalizeRecommendations = (value: unknown): Array<{ title: string; summary: string }> => {
    if (!Array.isArray(value)) return []
    const items: Array<{ title: string; summary: string }> = []
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue
      const row = entry as Record<string, unknown>
      const title = typeof row.title === "string" ? row.title.trim() : ""
      const summary = typeof row.summary === "string" ? row.summary.trim() : ""
      if (!title || !summary) continue
      items.push({ title, summary })
      if (items.length >= 3) break
    }
    return items
  }

  const resolveFromRecord = (record: Record<string, unknown>) => {
    const title = typeof record.title === "string" ? record.title.trim() : ""
    const slug = typeof record.slug === "string" ? record.slug.trim() : ""
    const content = typeof record.content === "string" ? record.content.trim() : ""
    const recommendations = normalizeRecommendations(record.recommendations)
    return {
      title: title || fallbackTitle,
      slug: slugify(slug || title || fallbackTitle),
      content,
      recommendations,
    }
  }

  const article = top.article
  if (article && typeof article === "object") {
    return resolveFromRecord(article as Record<string, unknown>)
  }

  if (typeof article === "string") {
    const asText = article.trim()
    if (!asText) return fallback
    const nested = extractJsonObjectText(asText)
    if (nested) {
      const nestedParsed = safeJsonParse<Record<string, unknown>>(nested, {})
      const normalized = resolveFromRecord(nestedParsed)
      if (normalized.content) return normalized
    }
    return {
      title: fallbackTitle,
      slug: slugify(fallbackTitle),
      content: asText,
      recommendations: [],
    }
  }

  const topLevel = resolveFromRecord(top)
  return topLevel
}

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return normalized || "untitled"
}

function normalizeFiletype(value: string | null | undefined): string {
  const normalized = (value || "").trim().toLowerCase().replace(/^\.+/, "")
  return normalized || "md"
}

function ensureSlugHasFiletype(slug: string, filetype: string): string {
  const normalizedSlug = slug.trim() || "untitled"
  const normalizedType = normalizeFiletype(filetype)
  const suffix = `.${normalizedType}`
  if (normalizedSlug.toLowerCase().endsWith(suffix)) return normalizedSlug
  return `${normalizedSlug}${suffix}`
}

function normalizePreviewItems(items: Array<{ intent?: string; title?: string; summary?: string }>): Array<{
  intent: string
  title: string
  summary: string
}> {
  const unique = new Map<string, { intent: string; title: string; summary: string }>()
  for (const item of items) {
    const intent = (item.intent || "").trim()
    const title = (item.title || "").trim()
    const summary = (item.summary || "").trim()
    if (!intent || !title || !summary) continue
    const key = intent.toLowerCase()
    if (!unique.has(key)) {
      unique.set(key, { intent, title, summary })
    }
  }
  return [...unique.values()].slice(0, 5)
}

function requiredConfigValue(configDB: { getValue: (key: string) => string | null }, key: string): string {
  const value = configDB.getValue(key)?.trim()
  if (!value) {
    throw new Error(`Missing required config value: ${key}`)
  }
  return value
}

function sanitizeSpellingOutput(raw: string): string {
  let text = raw.trim()
  if (!text) return ""

  text = text.replace(/^language:\s*[^\n\r]+[\n\r]+text:\s*/i, "")
  text = text.replace(/^language:\s*[a-z0-9-]+\s+text:\s*/i, "")
  text = text.replace(/^text:\s*/i, "")
  return text.trim()
}

function inferProviderFromBaseURL(baseURL: string): string {
  const trimmed = baseURL.trim()
  if (!trimmed) return "openai"

  try {
    const host = new URL(trimmed).hostname.toLowerCase()
    if (host.includes("deepseek")) return "deepseek"
    if (host.includes("moonshot")) return "moonshot"
    if (host === "api.z.ai" || host.endsWith(".z.ai")) return "zai"
    if (host.includes("openai")) return "openai"
    return host
  } catch {
    return trimmed
  }
}

function parseToolChoiceMode(value: string | null | undefined): "force" | "auto" {
  const mode = (value || "").trim().toLowerCase()
  if (mode === "auto") return "auto"
  return "force"
}

function isToolChoiceThinkingIncompatible(error: unknown): boolean {
  const anyError = error as { message?: unknown; error?: { message?: unknown } } | null
  const message = String(anyError?.message ?? anyError?.error?.message ?? "").toLowerCase()
  return message.includes("tool_choice") && message.includes("thinking") && message.includes("incompatible")
}

export class OpenaiMagicApi extends AbstractMagicApi {
  private appCtx: AppCtx
  private client: OpenAI | null = null
  private transportLoadedAtMs = 0
  private transportCacheTtlMs = 2000
  private transportSnapshot: {
    envName: string
    apiKey: string
    baseURL: string
  } | null = null

  constructor(args: { appCtx: AppCtx }) {
    super()
    this.appCtx = args.appCtx
    this.refreshClientIfNeeded(true)
  }

  providerName(_args: {}): string {
    this.refreshClientIfNeeded()
    return inferProviderFromBaseURL(this.transportSnapshot?.baseURL || "")
  }

  private loadTransportSnapshot(): {
    envName: string
    apiKey: string
    baseURL: string
  } {
    const configDB = this.appCtx.dbClients.config()
    const envName = configDB.getValue("llm.api_key.env_name")?.trim() || "OPENAI_API_KEY"
    const apiKey = process.env[envName]?.trim() || ""
    if (!apiKey) {
      throw new Error(`Missing API key for OpenAI magic provider. Set environment variable: ${envName}`)
    }

    const baseURL = configDB.getValue("llm.base_url")?.trim() || ""
    return { envName, apiKey, baseURL }
  }

  private refreshClientIfNeeded(force = false): OpenAI {
    const now = Date.now()
    if (!force && this.client && now - this.transportLoadedAtMs < this.transportCacheTtlMs) {
      return this.client
    }

    const next = this.loadTransportSnapshot()
    const changed =
      !this.transportSnapshot ||
      this.transportSnapshot.envName !== next.envName ||
      this.transportSnapshot.apiKey !== next.apiKey ||
      this.transportSnapshot.baseURL !== next.baseURL

    if (!this.client || changed || force) {
      this.client = next.baseURL
        ? new OpenAI({ apiKey: next.apiKey, baseURL: next.baseURL })
        : new OpenAI({ apiKey: next.apiKey })
      const provider = inferProviderFromBaseURL(next.baseURL)
      logLine(
        "info",
        `LLM transport refreshed provider=${provider} baseurl=${next.baseURL || "(default)"} env=${next.envName}`
      )
      logDebugJson(this.appCtx.config.app.debug, {
        event: "llm.transport.refresh",
        provider,
        baseurl: next.baseURL || "",
        envName: next.envName,
      })
      this.transportSnapshot = next
    }

    this.transportLoadedAtMs = now
    return this.client
  }

  private async createText(args: {
    model: string
    system: string
    user: string
  }): Promise<string> {
    const result = await this.createTextWithTrace(args)
    return result.text
  }

  private async createTextWithTrace(args: {
    model: string
    system: string
    user: string
  }): Promise<{
    text: string
    requestBody: {
      model: string
      stream: boolean
      messages: Array<{ role: string; content: string }>
    }
    rawResponse: unknown
  }> {
    const client = this.refreshClientIfNeeded()
    const requestBodyForLog = {
      model: args.model,
      stream: false as const,
      messages: [
        { role: "system" as const, content: args.system },
        { role: "user" as const, content: args.user },
      ],
    }

    try {
      const chatResponse = await client.chat.completions.create({
        model: args.model,
        stream: false,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      })
      return {
        text: getChatOutputText(chatResponse),
        requestBody: requestBodyForLog,
        rawResponse: chatResponse,
      }
    } catch (error) {
      const anyError = error as {
        name?: string
        message?: string
        status?: number
        code?: string
        type?: string
        request_id?: string
        headers?: unknown
        error?: unknown
      }
      const wrapped = new Error(anyError.message || "OpenAI request failed")
      wrapped.name = anyError.name || "OpenAIError"
      ;(wrapped as Error & { llmDetails?: unknown; status?: unknown; code?: unknown; type?: unknown }).llmDetails = {
        requestBody: requestBodyForLog,
        responseBody: anyError.error ?? null,
        responseHeaders: anyError.headers ?? null,
        requestId: anyError.request_id ?? null,
      }
      ;(wrapped as Error & { status?: unknown; code?: unknown; type?: unknown }).status = anyError.status
      ;(wrapped as Error & { code?: unknown; type?: unknown }).code = anyError.code
      ;(wrapped as Error & { type?: unknown }).type = anyError.type
      throw wrapped
    }
  }

  private async createToolJsonWithTrace<T>(args: {
    model: string
    system: string
    user: string
    toolName: string
    toolDescription: string
    parameters: Record<string, unknown>
  }): Promise<{
    parsed: T
    requestBody: Record<string, unknown>
    rawResponse: unknown
    rawText: string
  }> {
    const client = this.refreshClientIfNeeded()
    const toolChoiceMode = parseToolChoiceMode(this.appCtx.dbClients.config().getValue("llm.tool_choice.mode"))
    const requestBodyForLog: Record<string, unknown> = {
      model: args.model,
      stream: false,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      tools: [
        {
          type: "function" as const,
          function: {
            name: args.toolName,
            description: args.toolDescription,
            parameters: args.parameters,
          },
        },
      ],
    }
    if (toolChoiceMode === "force") {
      requestBodyForLog.tool_choice = {
        type: "function" as const,
        function: {
          name: args.toolName,
        },
      }
    }

    try {
      let chatResponse: unknown
      try {
        chatResponse = await client.chat.completions.create(requestBodyForLog as never)
      } catch (error) {
        if (!(toolChoiceMode === "force" && isToolChoiceThinkingIncompatible(error))) throw error
        const retryBody = { ...requestBodyForLog }
        delete retryBody.tool_choice
        chatResponse = await client.chat.completions.create(retryBody as never)
      }
      const toolArguments = getToolCallArgumentsText(chatResponse)
      if (toolArguments) {
        return {
          parsed: safeJsonParse<T>(toolArguments, {} as T),
          requestBody: requestBodyForLog,
          rawResponse: chatResponse,
          rawText: "",
        }
      }

      // Fallback for providers that ignore tool_choice and emit plain text JSON.
      const rawText = getChatOutputText(chatResponse)
      const extracted = extractJsonObjectText(rawText)
      return {
        parsed: safeJsonParse<T>(extracted || rawText, {} as T),
        requestBody: requestBodyForLog,
        rawResponse: chatResponse,
        rawText,
      }
    } catch (error) {
      const anyError = error as {
        name?: string
        message?: string
        status?: number
        code?: string
        type?: string
        request_id?: string
        headers?: unknown
        error?: unknown
      }
      const wrapped = new Error(anyError.message || "OpenAI request failed")
      wrapped.name = anyError.name || "OpenAIError"
      ;(wrapped as Error & { llmDetails?: unknown; status?: unknown; code?: unknown; type?: unknown }).llmDetails = {
        requestBody: requestBodyForLog,
        responseBody: anyError.error ?? null,
        responseHeaders: anyError.headers ?? null,
        requestId: anyError.request_id ?? null,
      }
      ;(wrapped as Error & { status?: unknown; code?: unknown; type?: unknown }).status = anyError.status
      ;(wrapped as Error & { code?: unknown; type?: unknown }).code = anyError.code
      ;(wrapped as Error & { type?: unknown }).type = anyError.type
      throw wrapped
    }
  }

  async correctSpelling(args: {
    text: string
    language?: string
  }): Promise<{ text: string }> {
    const configDB = this.appCtx.dbClients.config()
    const model = requiredConfigValue(configDB, "search.spelling_correction.model")

    const system =
      "Task: spelling correction for search queries only. " +
      "Output must be exactly one single-line query string, with no prefixes/suffixes, quotes, markdown, or explanations. " +
      "Never output phrases like 'Including results for', 'Did you mean', 'Search only for', 'Language:', or summaries. " +
      "Correct only clear spelling mistakes and obvious character errors. " +
      "Do not rewrite style, punctuation, formatting, or wording unless required to fix a real typo. " +
      "For keyword-style queries, preserve token order and separators whenever possible. " +
      "If no real typo exists, return the input unchanged. " +
      "Examples:\n" +
      "Input: self hosted vectro database\n" +
      "Output: self hosted vector database\n" +
      "Input: sqlite fts5 bm25\n" +
      "Output: sqlite fts5 bm25\n" +
      "Input: 胰岛素抵抗 基础概念\n" +
      "Output: 胰岛素抵抗 基础概念\n" +
      "Input: causes of world war i\n" +
      "Output: causes of world war i\n" +
      "Input: Including results for \"causes of world war i\". Search only for \"causes of world war i\"\n" +
      "Output: causes of world war i"
    const trace = await this.createToolJsonWithTrace<{ text?: string }>({
      model,
      system,
      user: args.text,
      toolName: "submit_spelling_correction",
      toolDescription: "Return the corrected query text",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
        },
        required: ["text"],
      },
    })
    const parsedText = typeof trace.parsed.text === "string" ? trace.parsed.text : ""
    const text = sanitizeSpellingOutput(parsedText || trace.rawText)
    return { text: text || args.text }
  }

  async resolveIntent(args: {
    query: string
    language?: string
    filetype?: string
  }): Promise<MagicSearchIntentResult> {
    const configDB = this.appCtx.dbClients.config()
    const model = requiredConfigValue(configDB, "search.intent_resolve.model")
    const filetype = normalizeFiletype(args.filetype)

    const trace = await this.createToolJsonWithTrace<{
      items?: Array<{ intent?: string; title?: string; summary?: string }>
    }>({
      model,
      system:
        "Resolve intents and generate one preview article metadata item per intent. " +
        "Return 2-5 deduplicated items. " +
        "Each item must include: intent, title, summary. " +
        "intent: A distinct user intent inferred from the query. Must be specific, actionable, and non-overlapping with other intents. " +
        "title: A clear article headline for this intent. 6-14 words, concrete and specific, no clickbait, no trailing punctuation, no markdown, no quotes. " +
        "summary: A concise preview shown on search results. 1-2 sentences (max 220 chars). Must state what the article will cover and the value to the user. Factual tone, no lists, no markdown, no filler.",
      user: [
        args.language ? `Language: ${args.language}` : "Language: auto-detect",
        `Query: ${args.query}`,
        `Requested output filetype: ${filetype}`,
      ].join("\n"),
      toolName: "submit_search_previews",
      toolDescription: "Return resolved intents and one preview article metadata item for each intent",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                intent: { type: "string" },
                title: { type: "string" },
                summary: { type: "string" },
              },
              required: ["intent", "title", "summary"],
            },
          },
        },
        required: ["items"],
      },
    })
    const items = normalizePreviewItems(trace.parsed.items ?? [])
    if (items.length > 0) return { items }
    throw new Error("Invalid preview response: items are required")
  }

  async createArticle(args: {
    query: string
    intent: string
    language?: string
    filetype?: string
  }): Promise<MagicSearchArticleResult> {
    const configDB = this.appCtx.dbClients.config()
    const model = requiredConfigValue(configDB, "search.content_generation.model")
    const toolChoiceMode = parseToolChoiceMode(configDB.getValue("llm.tool_choice.mode"))
    const filetype = normalizeFiletype(args.filetype)
    const isMarkdownOutput = filetype === "md"
    const systemPrompt = isMarkdownOutput
      ? "Write one useful markdown article for a search intent. " +
        "Also generate 1-3 recommended follow-up reading items (preview only, no content bodies). " +
        "For math notation in markdown, use only: inline `$equation$` and display `$$equation$$`. " +
        "Do not use escaped or alternative latex delimiters."
      : `Write one useful ${filetype} file for a search intent. ` +
        "Return file content only in the content field, with no markdown fences and no prose outside the generated file text. " +
        "Also generate 1-3 recommended follow-up reading items (preview only, no content bodies)."
    const fallbackSystemPrompt = isMarkdownOutput
      ? "Write one useful markdown article for a search intent. Return JSON only: " +
        "{\"article\": {\"title\": string, \"slug\": string, \"content\": string, \"recommendations\": [{\"title\": string, \"summary\": string}]}}. " +
        "Do not wrap JSON in markdown code fences. " +
        "For math notation in markdown, use only: inline `$equation$` and display `$$equation$$`. " +
        "Do not use escaped or alternative latex delimiters."
      : `Write one useful ${filetype} file for a search intent. Return JSON only: ` +
        "{\"article\": {\"title\": string, \"slug\": string, \"content\": string, \"recommendations\": [{\"title\": string, \"summary\": string}]}}. " +
        "Do not wrap JSON in markdown code fences. " +
        "The content must be raw file text with no markdown fences."

    const client = this.refreshClientIfNeeded()
    const requestBodyForLog: Record<string, unknown> = {
      model,
      stream: false,
      messages: [
        {
          role: "system" as const,
          content: systemPrompt,
        },
        {
          role: "user" as const,
          content: [
            args.language ? `Language: ${args.language}` : "Language: auto-detect",
            `Query: ${args.query}`,
            `Intent: ${args.intent}`,
            `Filetype: ${filetype}`,
          ].join("\n"),
        },
      ],
      tools: [
        {
          type: "function" as const,
          function: {
            name: "submit_article",
            description: "Return the generated article payload",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                article: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    slug: { type: "string" },
                    content: { type: "string" },
                    recommendations: {
                      type: "array",
                      minItems: 1,
                      maxItems: 3,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          title: { type: "string" },
                          summary: { type: "string" },
                        },
                        required: ["title", "summary"],
                      },
                    },
                  },
                  required: ["title", "slug", "content", "recommendations"],
                },
              },
              required: ["article"],
            },
          },
        },
      ],
    }
    if (toolChoiceMode === "force") {
      requestBodyForLog.tool_choice = {
        type: "function" as const,
        function: {
          name: "submit_article",
        },
      }
    }

    let rawResponse: unknown
    let rawResponseJson: string | null = null
    let responseText = ""
    let parsed: {
      article?: {
        title?: string
        slug?: string
        content?: string
        recommendations?: Array<{ title?: string; summary?: string }>
      }
    } = {}
    let fallbackRawResponse: unknown = null
    let fallbackRawResponseJson: string | null = null
    let fallbackResponseText = ""
    let fallbackParsed: {
      article?: {
        title?: string
        slug?: string
        content?: string
        recommendations?: Array<{ title?: string; summary?: string }>
      }
    } = {}
    try {
      let chatResponse: unknown
      try {
        chatResponse = await client.chat.completions.create(requestBodyForLog as never)
      } catch (error) {
        if (!(toolChoiceMode === "force" && isToolChoiceThinkingIncompatible(error))) throw error
        const retryBody = { ...requestBodyForLog }
        delete retryBody.tool_choice
        chatResponse = await client.chat.completions.create(retryBody as never)
      }
      rawResponse = chatResponse
      rawResponseJson = safeStringify(chatResponse)

      const toolArguments = getToolCallArgumentsText(chatResponse)
      if (toolArguments) {
        parsed = safeJsonParse<{
          article?: {
            title?: string
            slug?: string
            content?: string
            recommendations?: Array<{ title?: string; summary?: string }>
          }
        }>(toolArguments, {})
      } else {
        // Fallback for providers that ignore tool_choice and emit plain text JSON.
        responseText = getChatOutputText(chatResponse)
        const extracted = extractJsonObjectText(responseText)
        parsed = safeJsonParse<{
          article?: {
            title?: string
            slug?: string
            content?: string
            recommendations?: Array<{ title?: string; summary?: string }>
          }
        }>(extracted || responseText, {})
      }
    } catch (error) {
      const anyError = error as {
        name?: string
        message?: string
        status?: number
        code?: string
        type?: string
        request_id?: string
        headers?: unknown
        error?: unknown
      }
      const wrapped = new Error(anyError.message || "OpenAI request failed")
      wrapped.name = anyError.name || "OpenAIError"
      ;(wrapped as Error & { llmDetails?: unknown; status?: unknown; code?: unknown; type?: unknown }).llmDetails = {
        requestBody: requestBodyForLog,
        responseBody: anyError.error ?? null,
        responseHeaders: anyError.headers ?? null,
        requestId: anyError.request_id ?? null,
      }
      ;(wrapped as Error & { status?: unknown; code?: unknown; type?: unknown }).status = anyError.status
      ;(wrapped as Error & { code?: unknown; type?: unknown }).code = anyError.code
      ;(wrapped as Error & { type?: unknown }).type = anyError.type
      throw wrapped
    }

    let normalized = normalizeArticlePayload(parsed, args.intent)
    if (!normalized.content) {
      const fallback = await this.createTextWithTrace({
        model,
        system: fallbackSystemPrompt,
        user: [
          args.language ? `Language: ${args.language}` : "Language: auto-detect",
          `Query: ${args.query}`,
          `Intent: ${args.intent}`,
          `Filetype: ${filetype}`,
        ].join("\n"),
      })
      fallbackRawResponse = fallback.rawResponse
      fallbackRawResponseJson = safeStringify(fallback.rawResponse)
      fallbackResponseText = fallback.text
      const extracted = extractJsonObjectText(fallback.text)
      fallbackParsed = safeJsonParse<{
        article?: {
          title?: string
          slug?: string
          content?: string
          recommendations?: Array<{ title?: string; summary?: string }>
        }
      }>(
        extracted || fallback.text,
        {}
      )
      normalized = normalizeArticlePayload(fallbackParsed, args.intent)
    }
    const title = normalized.title
    const content = normalized.content
    if (!content) {
      const wrapped = new Error("Empty article content")
      ;(wrapped as Error & { llmDetails?: unknown }).llmDetails = {
        requestBody: requestBodyForLog,
        responseBody: rawResponse,
        responseBodyJson: rawResponseJson,
        rawText: responseText,
        parsedBody: parsed,
        fallbackResponseBody: fallbackRawResponse,
        fallbackResponseBodyJson: fallbackRawResponseJson,
        fallbackRawText: fallbackResponseText,
        fallbackParsedBody: fallbackParsed,
      }
      throw wrapped
    }
    if (normalized.recommendations.length === 0) {
      const wrapped = new Error("Empty recommendations")
      ;(wrapped as Error & { llmDetails?: unknown }).llmDetails = {
        requestBody: requestBodyForLog,
        responseBody: rawResponse,
        responseBodyJson: rawResponseJson,
        rawText: responseText,
        parsedBody: parsed,
        fallbackResponseBody: fallbackRawResponse,
        fallbackResponseBodyJson: fallbackRawResponseJson,
        fallbackRawText: fallbackResponseText,
        fallbackParsedBody: fallbackParsed,
      }
      throw wrapped
    }

    return {
      article: {
        title,
        slug: ensureSlugHasFiletype(normalized.slug, filetype),
        content,
        generatedBy: `${(this.transportSnapshot?.baseURL || "default").trim() || "default"}:${model}`,
      },
      recommendations: normalized.recommendations,
    }
  }

  async createImage(args: {
    description: string
    quality: MagicQuality
  }): Promise<MagicImageResult> {
    const client = this.refreshClientIfNeeded()
    const quality = args.quality === "normal" ? "medium" : args.quality

    const image = await client.images.generate({
      model: "gpt-image-1",
      prompt: args.description,
      quality,
      size: "1024x1024",
      output_format: "png",
    })

    const item = image.data?.[0]
    if (!item?.b64_json) {
      throw new Error("Image generation returned no binary payload")
    }

    return {
      mimeType: "image/png",
      binary: Buffer.from(item.b64_json, "base64"),
    }
  }
}
