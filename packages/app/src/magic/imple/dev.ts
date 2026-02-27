import fs from "node:fs"
import {
  AbstractMagicApi,
  MagicImageResult,
  MagicSearchArticleResult,
  MagicSearchIntentResult,
} from "../api.js"

const DEV_IMAGE_PATH = new URL("../../../data/image.png", import.meta.url)

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function randomBetween(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return normalized || "file"
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

export class DevMagicApi extends AbstractMagicApi {
  providerName(_args: {}): string {
    return "dev"
  }

  async correctSpelling(args: {
    text: string
    language?: string
  }): Promise<{ text: string }> {
    await wait(randomBetween(100, 250))
    return { text: args.text.trim() || args.text }
  }

  async resolveIntent(args: {
    query: string
    language?: string
  }): Promise<MagicSearchIntentResult> {
    await wait(randomBetween(350, 900))
    const q = args.query.trim()
    return {
      intents: normalizeIntents([
        q,
        `step-by-step guide for ${q}`,
        `troubleshooting ${q}`,
      ]),
    }
  }

  async createArticle(args: {
    query: string
    intent: string
    language?: string
  }): Promise<MagicSearchArticleResult> {
    await wait(randomBetween(700, 1800))
    const title = args.intent
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\w/, (char) => char.toUpperCase())

    return {
      article: {
        title,
        slug: slugify(title),
        content: `# ${title}

This is development-mode content for query: **${args.query}**.

## Summary
- Intent: ${args.intent}
- Provider: dev

## Steps
1. Understand the goal.
2. Run the required commands.
3. Verify the output.
`,
        generatedBy: "dev:dev-search-content",
      },
    }
  }

  async createImage(args: {
    description: string
    quality: "low" | "normal" | "high"
  }): Promise<MagicImageResult> {
    const delayByQuality = args.quality === "high" ? 900 : args.quality === "low" ? 250 : 550
    await wait(delayByQuality)

    return {
      mimeType: "image/png",
      binary: fs.readFileSync(DEV_IMAGE_PATH),
    }
  }
}
