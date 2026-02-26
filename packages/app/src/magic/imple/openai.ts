import OpenAI from "openai"
import { AppCtx } from "../../appCtx.js"
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

export class OpenaiMagicApi extends AbstractMagicApi {
  private appCtx: AppCtx
  private client: OpenAI

  constructor(args: { appCtx: AppCtx }) {
    super()
    this.appCtx = args.appCtx
    const configDB = this.appCtx.dbClients.config()
    const envName = configDB.getValue("llm.apikey.env_name")?.trim() || "OPENAI_API_KEY"
    const apiKey = process.env[envName]?.trim() || ""
    if (!apiKey) {
      throw new Error(`Missing API key for OpenAI magic provider. Set environment variable: ${envName}`)
    }

    const baseURL = configDB.getValue("llm.baseurl")?.trim() || ""
    this.client = new OpenAI(baseURL ? { apiKey, baseURL } : { apiKey })
  }

  providerName(_args: {}): string {
    return "openai"
  }

  async correctSpelling(args: {
    text: string
    language?: string
  }): Promise<{ text: string }> {
    const configDB = this.appCtx.dbClients.config()
    const model = requiredConfigValue(configDB, "search.spelling_correction.model")

    const response = await this.client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You correct spelling and grammar while preserving original meaning and tone. Return plain text only.",
        },
        {
          role: "user",
          content: [
            args.language ? `Language: ${args.language}` : "Language: auto-detect",
            `Text: ${args.text}`,
          ].join("\n"),
        },
      ],
    })

    const text = getOutputText(response).trim()
    return { text: text || args.text }
  }

  async resolveIntent(args: {
    query: string
    language?: string
  }): Promise<MagicSearchIntentResult> {
    const configDB = this.appCtx.dbClients.config()
    const model = requiredConfigValue(configDB, "search.intent_resolve.model")

    const response = await this.client.responses.create({
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
    const configDB = this.appCtx.dbClients.config()
    const model = requiredConfigValue(configDB, "search.content_generation.model")

    const response = await this.client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "Write one useful markdown article for a search intent. Return JSON only: " +
            "{\"article\": {\"title\": string, \"slug\": string, \"content\": string}}.",
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
    const quality = args.quality === "normal" ? "medium" : args.quality

    const image = await this.client.images.generate({
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
