export const DefaultConfigs: {
    key: string
    value: string
    description?: string
}[] = [
    {
        key: "llm.models",
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
        description: "Available global LLM model candidates shown in selectors (JSON array).",
    },
    {
        key: "search.intent_resolve.model",
        value: "gpt-5-mini",
        description: "LLM model used for search intent resolution.",
    },
    {
        key: "search.content_generation.model",
        value: "gpt-5.2-chat-latest",
        description: "LLM model used for search content/article generation.",
    },
    {
        key: "search.spelling_correction.model",
        value: "gpt-5-mini",
        description: "LLM model used for search spelling correction.",
    },
    {
        key: "search.spell_correction_mode",
        value: "auto",
        description: "Spell correction mode for search query normalization: off|auto|force.",
    },
    {
        key: "llm.baseurl",
        value: "",
        description: "Optional OpenAI-compatible base URL used by LLM calls. Leave empty for default OpenAI endpoint.",
    },
    {
        key: "search.example_queries",
        value: JSON.stringify([
            "how to use sqlite fts5 with ranking",
            "explain retrieval augmented generation step by step",
            "debugging memory leak in node express app",
            "best practices for typescript api error handling",
            "compare vector databases for small self-hosted projects",
            "how to write effective llm system prompts",
        ]),
        description: "Example queries shown on the search home screen for first-time users (JSON array).",
    },
    {
        key: "search.recent.min_query_chars",
        value: "3",
        description: "Minimum query length required for storing search history.",
    },
    {
        key: "search.recent.dedupe_window_seconds",
        value: "300",
        description: "Skip recording duplicate recent queries within this time window (in seconds).",
    },
    {
        key: "search.recent.blacklist_terms",
        value: JSON.stringify(["test", "testing", "asdf", "qwer", "zxcv", "1234"]),
        description: "Exact query terms excluded from recent history chips (JSON array, case-insensitive).",
    },
    {
        key: "llm.apikey.env_name",
        value: "OPENAI_API_KEY",
        description: "Environment variable name used to read API key for LLM calls.",
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
]
