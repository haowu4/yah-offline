import OpenAI from "openai";
import { createCallId, ellipsis40, errorDetails, isDebugEnabled, logDebugJson, logLine } from "../logging/index.js";

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

type SearchLLMOptions = {
    intentModel: string
    articleModel: string
    retryMaxAttempts: number
    requestTimeoutMs: number
    debug: boolean
}

type OpenAIResponseResult = Awaited<ReturnType<OpenAI["responses"]["create"]>>

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
    options: SearchLLMOptions

    constructor(openaiClient: OpenAI, options: SearchLLMOptions) {
        this.openaiClient = openaiClient
        this.options = options
    }

    private async withRetry<T>(run: (attempt: number) => Promise<T>): Promise<T> {
        let lastError: unknown = null
        for (let attempt = 1; attempt <= this.options.retryMaxAttempts; attempt += 1) {
            try {
                return await run(attempt)
            } catch (error) {
                lastError = error
                if (attempt >= this.options.retryMaxAttempts) break
            }
        }
        throw lastError instanceof Error ? lastError : new Error("Search generation failed")
    }

    private async createWithTimeout(
        args: Parameters<OpenAI["responses"]["create"]>[0]
    ): Promise<OpenAIResponseResult> {
        return await new Promise<OpenAIResponseResult>((resolve, reject) => {
            let settled = false
            const timer = setTimeout(() => {
                settled = true
                reject(new Error(`LLM request timed out after ${this.options.requestTimeoutMs}ms`))
            }, this.options.requestTimeoutMs)

            this.openaiClient.responses.create(args)
                .then((response) => {
                    if (settled) return
                    settled = true
                    clearTimeout(timer)
                    resolve(response as OpenAIResponseResult)
                })
                .catch((error) => {
                    if (settled) return
                    settled = true
                    clearTimeout(timer)
                    reject(error)
                })
        })
    }

    private getOutputText(response: OpenAIResponseResult): string {
        if ("output_text" in response && typeof response.output_text === "string") {
            return response.output_text
        }
        throw new Error("LLM response did not contain output_text")
    }

    async getIntent(query: string): Promise<{
        intents: Intention[]
    }> {
        const intents = await this.withRetry(async (attempt) => {
            const callId = createCallId()
            const startMs = Date.now()
            const triggerQuery = ellipsis40(query.trim())
            try {
                const response = await this.createWithTimeout({
                    model: this.options.intentModel,
                    input: [
                        {
                            role: "system",
                            content:
                                "You extract user search intents. Return JSON only with shape {\"intents\": string[]}. " +
                                "Output 2-5 concise intents, each <= 80 chars, no duplicates, no numbering, no markdown.",
                        },
                        {
                            role: "user",
                            content: `Query: ${query}`,
                        },
                    ],
                })

                const parsed = safeJsonParse<{ intents?: string[] }>(this.getOutputText(response), {})
                const next = normalizeIntents(parsed.intents ?? [])
                if (next.length === 0) {
                    throw new Error("No intents generated")
                }
                const durationMs = Date.now() - startMs
                logLine(
                    "info",
                    `LLM search intent-generation query="${triggerQuery}" model=${this.options.intentModel} ok ${durationMs}ms attempt=${attempt} cid=${callId}`
                )
                logDebugJson(this.options.debug, {
                    event: "llm.call",
                    provider: "openai",
                    operation: "responses.create",
                    component: "search",
                    trigger: "intent-generation",
                    query: query.trim(),
                    model: this.options.intentModel,
                    status: "ok",
                    durationMs,
                    attempt,
                    timeoutMs: this.options.requestTimeoutMs,
                    callId,
                })
                return next
            } catch (error) {
                const durationMs = Date.now() - startMs
                const details = errorDetails(error)
                logLine(
                    "error",
                    `LLM search intent-generation query="${triggerQuery}" model=${this.options.intentModel} error ${durationMs}ms attempt=${attempt} cid=${callId} msg="${details.errorMessage}"`
                )
                logDebugJson(this.options.debug, {
                    level: "error",
                    event: "llm.call",
                    provider: "openai",
                    operation: "responses.create",
                    component: "search",
                    trigger: "intent-generation",
                    query: query.trim(),
                    model: this.options.intentModel,
                    status: "error",
                    durationMs,
                    attempt,
                    timeoutMs: this.options.requestTimeoutMs,
                    callId,
                    errorName: details.errorName,
                    errorMessage: details.errorMessage,
                })
                throw error
            }
        })

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
        const generated = await this.withRetry(async (attempt) => {
            const callId = createCallId()
            const startMs = Date.now()
            const triggerQuery = ellipsis40(args.query.trim())
            const triggerIntent = ellipsis40(args.intent.trim())
            try {
                const response = await this.createWithTimeout({
                    model: this.options.articleModel,
                    input: [
                        {
                            role: "system",
                            content:
                                "Write one useful markdown article for a search intent. Return JSON only with shape " +
                                "{\"article\": {\"title\": string, \"slug\": string, \"content\": string}}. " +
                                "Prioritize factual accuracy, readability, and practical usefulness. No citations. " +
                                "Use whatever structure best fits the intent, do not force a fixed template.",
                        },
                        {
                            role: "user",
                            content: `Query: ${args.query}\nIntent: ${args.intent}`,
                        },
                    ],
                })

                const parsed = safeJsonParse<{
                    article?: { title?: string; slug?: string; content?: string }
                }>(this.getOutputText(response), {})

                const title = parsed.article?.title?.trim() || args.intent
                const content = parsed.article?.content?.trim() || ""
                if (!content) {
                    throw new Error("Empty article content")
                }
                const slug = slugify(parsed.article?.slug?.trim() || title)
                const durationMs = Date.now() - startMs
                logLine(
                    "info",
                    `LLM search article-generation query="${triggerQuery}" intent="${triggerIntent}" model=${this.options.articleModel} ok ${durationMs}ms attempt=${attempt} cid=${callId}`
                )
                logDebugJson(this.options.debug, {
                    event: "llm.call",
                    provider: "openai",
                    operation: "responses.create",
                    component: "search",
                    trigger: "article-generation",
                    query: args.query.trim(),
                    intent: args.intent.trim(),
                    model: this.options.articleModel,
                    status: "ok",
                    durationMs,
                    attempt,
                    timeoutMs: this.options.requestTimeoutMs,
                    callId,
                })
                return { title, content, slug }
            } catch (error) {
                const durationMs = Date.now() - startMs
                const details = errorDetails(error)
                logLine(
                    "error",
                    `LLM search article-generation query="${triggerQuery}" intent="${triggerIntent}" model=${this.options.articleModel} error ${durationMs}ms attempt=${attempt} cid=${callId} msg="${details.errorMessage}"`
                )
                logDebugJson(this.options.debug, {
                    level: "error",
                    event: "llm.call",
                    provider: "openai",
                    operation: "responses.create",
                    component: "search",
                    trigger: "article-generation",
                    query: args.query.trim(),
                    intent: args.intent.trim(),
                    model: this.options.articleModel,
                    status: "error",
                    durationMs,
                    attempt,
                    timeoutMs: this.options.requestTimeoutMs,
                    callId,
                    errorName: details.errorName,
                    errorMessage: details.errorMessage,
                })
                throw error
            }
        })

        return {
            article: {
                title: generated.title,
                slug: generated.slug,
                content: generated.content,
            },
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

export function createSearchLLM(
    apiKey: string,
    options?: Partial<SearchLLMOptions>
): SearchLLM {
    if (process.env.USE_DEV_LLM === "1") {
        return new DevSearchLLM()
    }

    if (!apiKey) {
        throw new Error(
            "Missing API key for OpenAI search generation. Set YAH_API_KEY or use USE_DEV_LLM=1."
        )
    }

    return new OpenAISearchLLM(new OpenAI({ apiKey }), {
        intentModel: options?.intentModel?.trim() || "gpt-5-mini",
        articleModel: options?.articleModel?.trim() || "gpt-5.2-chat-latest",
        retryMaxAttempts:
            Number.isInteger(options?.retryMaxAttempts) && (options?.retryMaxAttempts ?? 0) > 0
                ? (options?.retryMaxAttempts as number)
                : 2,
        requestTimeoutMs:
            Number.isInteger(options?.requestTimeoutMs) && (options?.requestTimeoutMs ?? 0) > 0
                ? (options?.requestTimeoutMs as number)
                : 20000,
        debug: isDebugEnabled(options?.debug),
    })
}
