

export const DefaultConfigs: {
    key: string
    value: string
    description?: string
}[] = [
    {
        key: "chat.models",
        value: JSON.stringify([
            "gpt-5.2",
            "gpt-5.1",
            "gpt-5",
            "gpt-5-mini",
            "gpt-5-nano",
            "gpt-5.2-chat-latest",
            "gpt-5.1-chat-latest",
            "gpt-5-chat-latest",
            "gpt-5.2-codex",
            "gpt-5.1-codex-max",
            "gpt-5.1-codex",
            "gpt-5-codex",
            "gpt-5.2-pro",
            "gpt-5-pro",
            "gpt-4.1",
            "gpt-4.1-mini",
            "gpt-4.1-nano",
            "gpt-4o",
            "gpt-4o-2024-05-13",
            "gpt-4o-mini",
        ]),
        description: "Available model candidates shown in the mail composer model selector (JSON array).",
    },
    {
        key: "mail.default_contact",
        value: "",
        description: "Default contact slug preselected in mail composer. Empty means no default contact.",
    },
    {
        key: "mail.default_model",
        value: "gpt-5.2-chat-latest",
        description: "Fallback LLM model used when request/contact model is not provided.",
    },
    {
        key: "mail.summary_model",
        value: "gpt-5-mini",
        description: "LLM model used for mail thread summarization.",
    },
    {
        key: "mail.context.system_prompt",
        value: "You are a mail assistant. Respond helpfully in markdown.",
        description: "Base system prompt used by the mail worker.",
    },
    {
        key: "mail.context.max_messages",
        value: "20",
        description: "Sliding-window message count for mail reply context.",
    },
    {
        key: "mail.context.summary_trigger_token_count",
        value: "5000",
        description: "Estimated token threshold to trigger thread summary generation.",
    },
    {
        key: "search.intent_model",
        value: "gpt-5-mini",
        description: "LLM model used for search intent extraction.",
    },
    {
        key: "search.article_model",
        value: "gpt-5.2-chat-latest",
        description: "LLM model used for search article generation.",
    },
    {
        key: "llm.retry.max_attempts",
        value: "2",
        description: "Maximum attempts for LLM generation calls before giving up.",
    },
    {
        key: "llm.retry.timeout_ms",
        value: "20000",
        description: "Per-attempt timeout in milliseconds for LLM generation calls.",
    },
    {
        key: "mail.attachments.max_count",
        value: "3",
        description: "Maximum number of model-generated attachments allowed per reply.",
    },
    {
        key: "mail.attachments.max_text_chars",
        value: "20000",
        description: "Maximum characters allowed for each model-generated text attachment.",
    },
]
