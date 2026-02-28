# @ootc/yah

## Getting Started

### Prerequisites

- Node.js 20+

### 1. Set Up LLM Provider Account And API Key

Pick one provider and complete its steps.

#### OpenAI

1. Create an API key in your OpenAI account.
2. Apply preset:

```bash
npx @ootc/yah config preset openai
```

3. Edit env:

```bash
npx @ootc/yah env edit
```

4. Set:

```bash
OPENAI_API_KEY=your_key_here
```

#### ZAI

1. Create an API key in your ZAI account.
2. Apply preset:

```bash
npx @ootc/yah config preset zai
```

3. Edit env:

```bash
npx @ootc/yah env edit
```

4. Set:

```bash
ZAI_API_KEY=your_key_here
```

#### DeepSeek

1. Create an API key in your DeepSeek account.
2. Apply preset:

```bash
npx @ootc/yah config preset deepseek
```

3. Edit env:

```bash
npx @ootc/yah env edit
```

4. Set:

```bash
DEEPSEEK_API_KEY=your_key_here
```

#### Moonshot

1. Create an API key in your Moonshot account.
2. Apply preset:

```bash
npx @ootc/yah config preset moonshot
```

3. Edit env:

```bash
npx @ootc/yah env edit
```

4. Set:

```bash
MOONSHOT_API_KEY=your_key_here
```

`env edit` creates a commented template automatically when the env file is missing.

### 2. Start Server

```bash
npx @ootc/yah start
```

Open:

- `http://127.0.0.1:11111`
- `/search` to run your first query
