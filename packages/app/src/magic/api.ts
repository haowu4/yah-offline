export type MagicQuality = "low" | "normal" | "high"

export type MagicChatMessage = {
  role: "user" | "assistant" | "system"
  content: string
  actorName?: string | null
}

export type MagicSearchIntentResult = {
  intents: string[]
}

export type MagicSearchArticleResult = {
  article: {
    title: string
    slug: string
    content: string
  }
}

export type MagicMailReplyAttachment =
  | {
      kind: "text"
      filename: string
      quality: MagicQuality
      content: string
    }
  | {
      kind: "image"
      filename: string
      quality: MagicQuality
      description: string
    }

export type MagicMailReplyResult = {
  content: string
  attachments: MagicMailReplyAttachment[]
}

export type MagicImageResult = {
  mimeType: string
  binary: Buffer
}

export abstract class AbstractMagicApi {
  abstract providerName(args: {}): string

  abstract correctSpelling(args: {
    text: string
    language?: string
  }): Promise<{ text: string }>

  abstract resolveIntent(args: {
    query: string
    language?: string
  }): Promise<MagicSearchIntentResult>

  abstract createArticle(args: {
    query: string
    intent: string
    language?: string
  }): Promise<MagicSearchArticleResult>

  abstract summarize(args: {
    messages: MagicChatMessage[]
  }): Promise<{ summary: string }>

  abstract createReply(args: {
    summary: string
    history: MagicChatMessage[]
    userInput: string
    attachmentPolicy: {
      maxCount: number
      maxTextChars: number
    }
  }): Promise<MagicMailReplyResult>

  abstract createImage(args: {
    description: string
    quality: MagicQuality
  }): Promise<MagicImageResult>
}
