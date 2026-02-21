import OpenAI from "openai"
import path from "node:path"
import { AsyncLocalStorage } from "node:async_hooks"
import { AppCtx } from "../../appCtx.js"
import {
  AbstractMagicApi,
  MagicImageResult,
  MagicMailReplyAttachment,
  MagicMailReplyResult,
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

function extractJsonLikeObject(text: string): Record<string, unknown> | null {
  const direct = safeJsonParse<Record<string, unknown> | null>(text, null)
  if (direct && typeof direct === "object") return direct

  const fencedMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fencedMatch?.[1]) {
    const fenced = safeJsonParse<Record<string, unknown> | null>(fencedMatch[1].trim(), null)
    if (fenced && typeof fenced === "object") return fenced
  }

  return null
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

function sanitizeAttachmentFilename(input: string): string {
  const name = path.basename(input).replace(/[/\\]/g, "").trim()
  if (!name) return "attachment"
  return name.slice(0, 120)
}

function normalizeQuality(value: unknown): MagicQuality {
  return value === "low" || value === "normal" || value === "high" ? value : "normal"
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

function normalizeReplyAttachments(
  value: unknown,
  policy: { maxCount: number; maxTextChars: number }
): MagicMailReplyAttachment[] {
  if (!Array.isArray(value)) return []

  const result: MagicMailReplyAttachment[] = []
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue
    const obj = candidate as Record<string, unknown>
    const kind = obj.kind === "text" || obj.kind === "image" ? obj.kind : null
    if (!kind) continue

    const filename = sanitizeAttachmentFilename(typeof obj.filename === "string" ? obj.filename : "")
    if (!filename) continue
    const quality = normalizeQuality(obj.quality)

    if (kind === "text") {
      const content = typeof obj.content === "string" ? obj.content.trim() : ""
      if (!content) continue
      result.push({
        kind,
        filename,
        quality,
        content: content.slice(0, policy.maxTextChars),
      })
      continue
    }

    const description = typeof obj.description === "string" ? obj.description.trim() : ""
    if (!description) continue
    result.push({
      kind,
      filename,
      quality,
      description,
    })
  }

  return result.slice(0, Math.max(0, policy.maxCount))
}

export class OpenaiMagicApi extends AbstractMagicApi {
  private appCtx: AppCtx
  private client: OpenAI
  private executionContext = new AsyncLocalStorage<{
    mailModelOverride?: string
  }>()

  constructor(args: { appCtx: AppCtx }) {
    super()
    this.appCtx = args.appCtx
    const apiKey = this.appCtx.config.api.apiKey
    if (!apiKey) {
      throw new Error("Missing API key for OpenAI magic provider. Set YAH_API_KEY.")
    }
    this.client = new OpenAI({ apiKey })
  }

  providerName(_args: {}): string {
    return "openai"
  }

  async withExecutionContext<T>(args: {
    context: {
      mailModelOverride?: string
    }
    run: () => Promise<T>
  }): Promise<T> {
    return await this.executionContext.run(args.context, args.run)
  }

  async correctSpelling(args: {
    text: string
    language?: string
  }): Promise<{ text: string }> {
    const configDB = this.appCtx.dbClients.config()
    const model = configDB.getValue("search.intent_model") || "gpt-5-mini"

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
    const model = configDB.getValue("search.intent_model") || "gpt-5-mini"

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
    const model = configDB.getValue("search.article_model") || "gpt-5.2-chat-latest"

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

  async summarize(args: {
    assistantDescription?: string
    messages: Array<{
      role: "user" | "assistant" | "system"
      content: string
      actorName?: string | null
    }>
  }): Promise<{ summary: string }> {
    if (args.messages.length === 0) {
      return { summary: "" }
    }

    const configDB = this.appCtx.dbClients.config()
    const model = configDB.getValue("mail.summary_model") || "gpt-5-mini"
    const basePrompt =
      configDB.getValue("mail.context.system_prompt") ||
      "You are a mail assistant. Respond helpfully in markdown."

    const response = await this.client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            `${basePrompt}\n\n` +
            "Summarize this mail thread for future turns in under 350 words. " +
            "Prioritize factual points, user goals, constraints, and unresolved questions.",
        },
        {
          role: "system",
          content: `Assistant description:\n${args.assistantDescription || "(none)"}`,
        },
        {
          role: "user",
          content: args.messages
            .map((message) => {
              const actor = message.actorName ? `(${message.actorName})` : ""
              return `${message.role}${actor}: ${message.content}`
            })
            .join("\n\n"),
        },
      ],
    })

    return { summary: getOutputText(response).trim() }
  }

  async createReply(args: {
    assistantDescription?: string
    summary: string
    history: Array<{
      role: "user" | "assistant" | "system"
      content: string
      actorName?: string | null
    }>
    userInput: string
    attachmentPolicy: {
      maxCount: number
      maxTextChars: number
    }
  }): Promise<MagicMailReplyResult> {
    const configDB = this.appCtx.dbClients.config()
    const context = this.executionContext.getStore()
    const model = context?.mailModelOverride || configDB.getValue("mail.default_model") || "gpt-5.2-chat-latest"
    const basePrompt =
      configDB.getValue("mail.context.system_prompt") ||
      "You are a mail assistant. Respond helpfully in markdown."

    const historyText = args.history
      .map((message) => {
        const actor = message.actorName ? `(${message.actorName})` : ""
        return `${message.role}${actor}: ${message.content}`
      })
      .join("\n\n")

    const response = await this.client.responses.create({
      model,
      text: {
        format: {
          type: "json_schema",
          name: "mail_reply_payload",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["content", "attachments"],
            properties: {
              content: { type: "string" },
              attachments: {
                type: "array",
                items: {
                  type: "object",
                  oneOf: [
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["kind", "filename", "quality", "content"],
                      properties: {
                        kind: { type: "string", enum: ["text"] },
                        filename: { type: "string" },
                        quality: { type: "string", enum: ["low", "normal", "high"] },
                        content: { type: "string" },
                      },
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["kind", "filename", "quality", "description"],
                      properties: {
                        kind: { type: "string", enum: ["image"] },
                        filename: { type: "string" },
                        quality: { type: "string", enum: ["low", "normal", "high"] },
                        description: { type: "string" },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      } as unknown as Record<string, unknown>,
      input: [
        {
          role: "system",
          content:
            `${basePrompt}\n\n` +
            "Act like a ChatGPT-style assistant: factual, readable, useful, and concise when appropriate. " +
            "Create attachments only if the user explicitly asks for a file/image artifact. " +
            "Reply content must be markdown.",
        },
        {
          role: "system",
          content: `Assistant description:\n${args.assistantDescription || "(none)"}`,
        },
        {
          role: "system",
          content: `Conversation summary (primary context):\n${args.summary || "(empty)"}`,
        },
        {
          role: "user",
          content:
            `Recent conversation history:\n${historyText || "(no prior history)"}\n\n` +
            `Current user message:\n${args.userInput}`,
        },
      ],
    })

    const rawText = getOutputText(response).trim()
    const parsed = extractJsonLikeObject(rawText) || {}
    const contentFromJson =
      typeof parsed.content === "string"
        ? parsed.content.trim()
        : typeof parsed.reply === "string"
          ? parsed.reply.trim()
          : ""
    const content = contentFromJson || rawText
    if (!content.trim()) throw new Error("Empty mail reply content")

    return {
      content,
      attachments: normalizeReplyAttachments(parsed.attachments, args.attachmentPolicy),
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
