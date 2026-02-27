export type MagicQuality = "low" | "normal" | "high"

export type MagicSearchIntentResult = {
  intents: string[]
}

export type MagicSearchArticleResult = {
  article: {
    title: string
    slug: string
    content: string
    generatedBy: string
  }
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

  abstract createImage(args: {
    description: string
    quality: MagicQuality
  }): Promise<MagicImageResult>
}
