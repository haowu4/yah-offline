import OpenAI from "openai";

export type Intention = {
    value: string
}

export type Article = {
    title: string
    slug: string
    content: string
}

export interface SearchLLM {
    getIntent(query: string): Promise<{
        intents: Intention[]
    }>

    createArticle(args: {
        query: string
        intent: string
    }): Promise<{
        article: Article
    }>
}

function safeJsonParse<T>(text: string, fallback: T): T {
    try {
        return JSON.parse(text) as T
    } catch {
        return fallback
    }
}

function slugify(input: string): string {
    const normalized = input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    return normalized || "untitled"
}

function normalizeIntents(intents: string[]): Intention[] {
    const unique = new Set<string>()
    for (const intent of intents) {
        const value = intent.trim()
        if (!value) continue
        unique.add(value)
    }
    return [...unique].slice(0, 5).map((value) => ({ value }))
}

async function wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
}

function randomBetween(minMs: number, maxMs: number): number {
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

export class OpenAISearchLLM implements SearchLLM {
    openaiClient: OpenAI

    constructor(openaiClient: OpenAI) {
        this.openaiClient = openaiClient
    }

    async getIntent(query: string): Promise<{
        intents: Intention[]
    }> {
        const response = await this.openaiClient.responses.create({
            model: "gpt-4.1-mini",
            input: [
                {
                    role: "system",
                    content:
                        "You are an intent resolver for search. Return only valid JSON with shape {\"intents\": string[]}. Keep 2-5 concise intents.",
                },
                {
                    role: "user",
                    content: `Query: ${query}`,
                },
            ],
        })

        const parsed = safeJsonParse<{ intents?: string[] }>(response.output_text, {})
        const intents = normalizeIntents(parsed.intents ?? [])

        if (intents.length === 0) {
            return { intents: [{ value: query.trim() }] }
        }

        return { intents }
    }

    async createArticle(args: {
        query: string
        intent: string
    }): Promise<{
        article: Article
    }> {
        const response = await this.openaiClient.responses.create({
            model: "gpt-4.1-mini",
            input: [
                {
                    role: "system",
                    content:
                        "Write one markdown article for a search intent. Return only valid JSON with shape {\"article\": {\"title\": string, \"slug\": string, \"content\": string}}.",
                },
                {
                    role: "user",
                    content: `Query: ${args.query}\nIntent: ${args.intent}`,
                },
            ],
        })

        const parsed = safeJsonParse<{
            article?: { title?: string; slug?: string; content?: string }
        }>(response.output_text, {})

        const title = parsed.article?.title?.trim() || args.intent
        const content =
            parsed.article?.content?.trim() ||
            `# ${title}\n\nNo content generated for this intent.`
        const slug = slugify(parsed.article?.slug?.trim() || title)

        return {
            article: { title, slug, content },
        }
    }
}

export class DevSearchLLM implements SearchLLM {
    async getIntent(query: string): Promise<{ intents: Intention[] }> {
        await wait(randomBetween(350, 900))
        const q = query.trim()
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
    }): Promise<{ article: Article }> {
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
- Mode: \`USE_DEV_LLM=1\`

## Steps
1. Understand the goal.
2. Run the required commands.
3. Verify the output.
`,
            },
        }
    }
}

export function createSearchLLM(apiKey: string): SearchLLM {
    if (process.env.USE_DEV_LLM === "1") {
        return new DevSearchLLM()
    }

    if (!apiKey) {
        throw new Error(
            "Missing API key for OpenAI search generation. Set YAH_API_KEY or use USE_DEV_LLM=1."
        )
    }

    return new OpenAISearchLLM(new OpenAI({ apiKey }))
}
