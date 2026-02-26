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

function getOutputText(response: Awaited<ReturnType<OpenAI["responses"]["create"]>>): string {
  if ("output_text" in response && typeof response.output_text === "string") {
    return response.output_text
  }
  throw new Error("Magic response did not contain output_text")
}

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return normalized || "untitled"
}

function normalizeIntents(intents: string[]): string[] {
  const unique = new Set<string>()
  for (const intent of intents) {
    const value = intent.trim()
    if (!value) continue
    unique.add(value)
  }
  return [...unique].slice(0, 5)
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
    return "openai"
  }

  private loadTransportSnapshot(): {
    envName: string
    apiKey: string
    baseURL: string
  } {
    const configDB = this.appCtx.dbClients.config()
    const envName = configDB.getValue("llm.apikey.env_name")?.trim() || "OPENAI_API_KEY"
    const apiKey = process.env[envName]?.trim() || ""
    if (!apiKey) {
      throw new Error(`Missing API key for OpenAI magic provider. Set environment variable: ${envName}`)
    }

    const baseURL = configDB.getValue("llm.baseurl")?.trim() || ""
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

  async correctSpelling(args: {
    text: string
    language?: string
  }): Promise<{ text: string }> {
    const client = this.refreshClientIfNeeded()
    const configDB = this.appCtx.dbClients.config()
    const model = requiredConfigValue(configDB, "search.spelling_correction.model")

    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
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
            "Output: causes of world war i",
        },
        {
          role: "user",
          content: args.text,
        },
      ],
    })

    const text = sanitizeSpellingOutput(getOutputText(response))
    return { text: text || args.text }
  }

  async resolveIntent(args: {
    query: string
    language?: string
  }): Promise<MagicSearchIntentResult> {
    const client = this.refreshClientIfNeeded()
    const configDB = this.appCtx.dbClients.config()
    const model = requiredConfigValue(configDB, "search.intent_resolve.model")

    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "Extract user search intents. Return JSON only: {\"intents\": string[]}. " +
            "Output 2-5 concise intents, no duplicates, no numbering, no markdown.",
        },
        {
          role: "user",
          content: [
            args.language ? `Language: ${args.language}` : "Language: auto-detect",
            `Query: ${args.query}`,
          ].join("\n"),
        },
      ],
    })

    const parsed = safeJsonParse<{ intents?: string[] }>(getOutputText(response), {})
    const intents = normalizeIntents(parsed.intents ?? [])
    return { intents: intents.length > 0 ? intents : [args.query.trim()] }
  }

  async createArticle(args: {
    query: string
    intent: string
    language?: string
  }): Promise<MagicSearchArticleResult> {
    const client = this.refreshClientIfNeeded()
    const configDB = this.appCtx.dbClients.config()
    const model = requiredConfigValue(configDB, "search.content_generation.model")

    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "Write one useful markdown article for a search intent. Return JSON only: " +
            "{\"article\": {\"title\": string, \"slug\": string, \"content\": string}}. " +
            "For math notation in markdown, use only: inline `$equation$` and display `$$equation$$`. " +
            "Do not use escaped or alternative latex delimiters.",
        },
        {
          role: "user",
          content: [
            args.language ? `Language: ${args.language}` : "Language: auto-detect",
            `Query: ${args.query}`,
            `Intent: ${args.intent}`,
          ].join("\n"),
        },
      ],
    })

    const parsed = safeJsonParse<{
      article?: { title?: string; slug?: string; content?: string }
    }>(getOutputText(response), {})

    const title = parsed.article?.title?.trim() || args.intent.trim() || "Untitled"
    const content = parsed.article?.content?.trim() || ""
    if (!content) {
      throw new Error("Empty article content")
    }

    return {
      article: {
        title,
        slug: slugify(parsed.article?.slug?.trim() || title),
        content,
      },
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
