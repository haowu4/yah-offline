


export class MailLLM {
    openaiClient: OpenAI
    constructor(openaiClient: OpenAI) {
        this.openaiClient = openaiClient
    }

    async updateContent(currentContent: string, userInstruction: string): Promise<{
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