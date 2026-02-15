import OpenAI from "openai";

export type Intention = {
    value: string
}

export type Article = {
    title: string
    content: string
}

class SearchLLM {
    openaiClient: OpenAI
    constructor(openaiClient: OpenAI) {
        this.openaiClient = openaiClient
    }

    async getGetIntent(query: string): Promise<{
        intents: Intention[]
    }> {
        throw new Error()
    }

    async createArticle(query: string): Promise<{
        intents: Intention[]
    }> {
        throw new Error()
    }

}