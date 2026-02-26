export type PresetName = "openai" | "zai" | "deepseek" | "moonshot"

const OPENAI_MODELS = [
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
]

const ZAI_MODELS = [
  "GLM-5",
  "GLM-5-Code",
  "GLM-4.7",
  "GLM-4.7-FlashX",
  "GLM-4.6",
  "GLM-4.5",
  "GLM-4.5-X",
  "GLM-4.5-Air",
  "GLM-4.5-AirX",
  "GLM-4-32B-0414-128K",
  "GLM-4.7-Flash",
  "GLM-4.5-Flash",
]

const DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner"]

const MOONSHOT_MODELS = [
  "kimi-k2.5",
  "kimi-k2-turbo-preview",
  "kimi-k2-thinking",
  "kimi-k2-thinking-turbo",
]

const presetValues: Record<PresetName, Record<string, string>> = {
  openai: {
    "llm.models": JSON.stringify(OPENAI_MODELS),
    "search.content_generation.model": "gpt-5.2-chat-latest",
    "search.intent_resolve.model": "gpt-5-mini",
    "search.spelling_correction.model": "gpt-5-mini",
    "llm.baseurl": "",
    "llm.apikey.env_name": "OPENAI_API_KEY",
  },
  zai: {
    "llm.models": JSON.stringify(ZAI_MODELS),
    "search.content_generation.model": "GLM-4.7",
    "search.intent_resolve.model": "GLM-4.7-FlashX",
    "search.spelling_correction.model": "GLM-4.7-FlashX",
    "llm.baseurl": "https://api.z.ai/api/paas/v4/",
    "llm.apikey.env_name": "ZAI_API_KEY",
  },
  deepseek: {
    "llm.models": JSON.stringify(DEEPSEEK_MODELS),
    "search.content_generation.model": "deepseek-chat",
    "search.intent_resolve.model": "deepseek-chat",
    "search.spelling_correction.model": "deepseek-chat",
    "llm.baseurl": "https://api.deepseek.com",
    "llm.apikey.env_name": "DEEPSEEK_API_KEY",
  },
  moonshot: {
    "llm.models": JSON.stringify(MOONSHOT_MODELS),
    "search.content_generation.model": "kimi-k2.5",
    "search.intent_resolve.model": "kimi-k2-turbo-preview",
    "search.spelling_correction.model": "kimi-k2-turbo-preview",
    "llm.baseurl": "https://api.moonshot.ai/v1",
    "llm.apikey.env_name": "MOONSHOT_API_KEY",
  },
}

export function parsePresetName(value: string | undefined): PresetName | null {
  if (value === "openai" || value === "zai" || value === "deepseek" || value === "moonshot") {
    return value
  }
  return null
}

export function getPresetValues(preset: PresetName): Record<string, string> {
  return presetValues[preset]
}
