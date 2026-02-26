## LLM Presets

We offer the following LLM presets to make it easier for user to swtich between different providers.

### OPENAI

```
client = OpenAI(
    api_key="",
)

```

#### Models

```
[
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
```

### z.ai

```
client = OpenAI(
    api_key="your-Z.AI-api-key",
    base_url="https://api.z.ai/api/paas/v4/",
)
```

#### Models:

| Model               | Input  | Cached Input | Cached Input Storage | Output |
| :------------------ | :----- | :----------- | :------------------- | :----- |
| GLM-5               | \$1    | \$0.2        | Limited-time Free    | \$3.2  |
| GLM-5-Code          | \$1.2  | \$0.3        | Limited-time Free    | \$5    |
| GLM-4.7             | \$0.6  | \$0.11       | Limited-time Free    | \$2.2  |
| GLM-4.7-FlashX      | \$0.07 | \$0.01       | Limited-time Free    | \$0.4  |
| GLM-4.6             | \$0.6  | \$0.11       | Limited-time Free    | \$2.2  |
| GLM-4.5             | \$0.6  | \$0.11       | Limited-time Free    | \$2.2  |
| GLM-4.5-X           | \$2.2  | \$0.45       | Limited-time Free    | \$8.9  |
| GLM-4.5-Air         | \$0.2  | \$0.03       | Limited-time Free    | \$1.1  |
| GLM-4.5-AirX        | \$1.1  | \$0.22       | Limited-time Free    | \$4.5  |
| GLM-4-32B-0414-128K | \$0.1  | -            | -                    | \$0.1  |
| GLM-4.7-Flash       | Free   | Free         | Free                 | Free   |
| GLM-4.5-Flash       | Free   | Free         | Free                 | Free   |


### deepseek

```
client = OpenAI(api_key=os.environ.get('DEEPSEEK_API_KEY'), base_url="https://api.deepseek.com")
```

#### Models

- kimi-k2.5
- kimi-k2-turbo-preview
- kimi-k2-thinking
- kimi-k2-thinking-turbo


### moonshot

```
client = OpenAI(
    api_key = "$MOONSHOT_API_KEY",
    base_url = "https://api.moonshot.ai/v1",
)
```

#### Models

- kimi-k2.5
- kimi-k2-turbo-preview
- kimi-k2-thinking
- kimi-k2-thinking-turbo

