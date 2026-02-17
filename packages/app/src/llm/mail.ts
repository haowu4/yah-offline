import OpenAI from "openai"
import { MailLLMReply, MailReplyRecord } from "../type/mail.js"

type MailContextMessage = Pick<MailReplyRecord, "role" | "content"> & {
  contactName?: string | null
}

export interface MailLLM {
  generateReply(args: {
    model: string
    systemPrompt: string
    contactInstruction: string
    summary: string
    history: MailContextMessage[]
    userInput: string
  }): Promise<MailLLMReply>

  summarize(args: {
    model: string
    systemPrompt: string
    contactInstruction: string
    messages: MailContextMessage[]
  }): Promise<string>

  createImage(args: {
    prompt: string
    modelQuality: "low" | "normal" | "high"
  }): Promise<{ mimeType: string; binary: Buffer }>
}

const DEV_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WvBy5YAAAAASUVORK5CYII="

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

function normalizeAttachments(
  value: unknown
): MailLLMReply["attachments"] {
  if (!Array.isArray(value)) return []

  const result: MailLLMReply["attachments"] = []
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue
    const obj = candidate as Record<string, unknown>
    const kind = obj.kind === "text" || obj.kind === "image" ? obj.kind : null
    if (!kind) continue

    const filename = typeof obj.filename === "string" ? obj.filename.trim() : ""
    const modelQuality =
      obj.modelQuality === "low" || obj.modelQuality === "normal" || obj.modelQuality === "high"
        ? obj.modelQuality
        : "normal"

    if (kind === "text") {
      const content = typeof obj.content === "string" ? obj.content.trim() : ""
      if (!filename || !content) continue
      result.push({
        kind,
        filename,
        modelQuality,
        content,
      })
      continue
    }

    const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : ""
    if (!filename || !prompt) continue
    result.push({
      kind,
      filename,
      modelQuality,
      prompt,
    })
  }

  return result.slice(0, 6)
}

class DevMailLLM implements MailLLM {
  async generateReply(args: {
    model: string
    systemPrompt: string
    contactInstruction: string
    summary: string
    history: MailContextMessage[]
    userInput: string
  }): Promise<MailLLMReply> {
    const preface = args.contactInstruction
      ? `Replying with persona instruction: ${args.contactInstruction}`
      : "Replying with default assistant persona."

    return {
      content: `### Response\n\n${preface}\n\nYou said:\n\n> ${args.userInput}\n\nModel: \`${args.model}\``,
      attachments: [],
    }
  }

  async summarize(args: {
    model: string
    systemPrompt: string
    contactInstruction: string
    messages: MailContextMessage[]
  }): Promise<string> {
    const latest = args.messages.slice(-6).map((message) => `${message.role}: ${message.content}`)
    return latest.join("\n\n").slice(0, 1000)
  }

  async createImage(args: {
    prompt: string
    modelQuality: "low" | "normal" | "high"
  }): Promise<{ mimeType: string; binary: Buffer }> {
    return {
      mimeType: "image/png",
      binary: Buffer.from(DEV_PNG_BASE64, "base64"),
    }
  }
}

class OpenAIMailLLM implements MailLLM {
  openaiClient: OpenAI

  constructor(openaiClient: OpenAI) {
    this.openaiClient = openaiClient
  }

  async generateReply(args: {
    model: string
    systemPrompt: string
    contactInstruction: string
    summary: string
    history: MailContextMessage[]
    userInput: string
  }): Promise<MailLLMReply> {
    const historyText = args.history
      .map((message) => {
        const persona = message.contactName ? `(${message.contactName})` : ""
        return `${message.role}${persona}: ${message.content}`
      })
      .join("\n\n")

    const response = await this.openaiClient.responses.create({
      model: args.model,
      input: [
        {
          role: "system",
          content:
            `${args.systemPrompt}\n\n` +
            "Return strict JSON with shape {\"content\": string, \"attachments\": Attachment[]}." +
            "Attachment for text: {kind:'text', filename, modelQuality, content}. " +
            "Attachment for image: {kind:'image', filename, modelQuality, prompt}. " +
            "Reply content must be markdown.",
        },
        {
          role: "system",
          content: `Contact instruction:\n${args.contactInstruction || "(none)"}`,
        },
        {
          role: "system",
          content: `Conversation summary:\n${args.summary || "(empty)"}`,
        },
        {
          role: "user",
          content:
            `Conversation history:\n${historyText || "(no prior history)"}\n\n` +
            `Current user message:\n${args.userInput}`,
        },
      ],
    })

    const parsed = safeJsonParse<{ content?: string; attachments?: unknown }>(response.output_text, {})
    const content = parsed.content?.trim() || "I could not generate a full response yet."

    return {
      content,
      attachments: normalizeAttachments(parsed.attachments),
    }
  }

  async summarize(args: {
    model: string
    systemPrompt: string
    contactInstruction: string
    messages: MailContextMessage[]
  }): Promise<string> {
    if (args.messages.length === 0) return ""

    const response = await this.openaiClient.responses.create({
      model: args.model,
      input: [
        {
          role: "system",
          content:
            `${args.systemPrompt}\n\n` +
            "Summarize this mail thread context for future turns in under 350 words.",
        },
        {
          role: "system",
          content: `Contact instruction:\n${args.contactInstruction || "(none)"}`,
        },
        {
          role: "user",
          content: args.messages
            .map((message) => `${message.role}: ${message.content}`)
            .join("\n\n"),
        },
      ],
    })

    return response.output_text.trim()
  }

  async createImage(args: {
    prompt: string
    modelQuality: "low" | "normal" | "high"
  }): Promise<{ mimeType: string; binary: Buffer }> {
    const quality = args.modelQuality === "normal" ? "medium" : args.modelQuality
    const image = await this.openaiClient.images.generate({
      model: "gpt-image-1",
      prompt: args.prompt,
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

export function createMailLLM(apiKey: string): MailLLM {
  if (process.env.USE_DEV_LLM === "1") {
    return new DevMailLLM()
  }

  if (!apiKey) {
    throw new Error(
      "Missing API key for mail generation. Set YAH_API_KEY or use USE_DEV_LLM=1."
    )
  }

  return new OpenAIMailLLM(new OpenAI({ apiKey }))
}
