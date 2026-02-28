# Config Reference

## Environment Variables (Backend)

| Variable | Default | Description |
|---|---|---|
| `YAH_STORAGE_PATH` | platform app-data path + `/data` | Base storage folder. |
| `YAH_ON_DB_SCHEMA_CONFLICT` | `quit` | `quit` or `backup-and-overwrite`. |
| `YAH_ENABLE_CONFIG_ROUTES` | `true` | Enable `/config` HTTP routes. |
| `YAH_SERVE_WEB_UI` | `true` | Serve bundled SPA assets from backend when available. Set `0` for Vite-proxy dev mode. |
| `YAH_HOST` | `127.0.0.1` | Backend bind host. |
| `YAH_PORT` | `11111` | Backend bind port. |
| `YAH_MAGIC_PROVIDER` | `openai` | `openai` or `dev`. |
| `YAH_DEBUG` | `false` | Enables debug logging output. |

Notes:
- DB path is fixed to `path.join(YAH_STORAGE_PATH, "yah.db")`.
- `YAH_DB_PATH` is retired.

## Runtime Config Keys (Database)

Managed via `/config` page or CLI `config` subcommands.

Key groups:

- LLM models and transport:
  - `llm.models`
  - `llm.base_url`
  - `llm.api_key.env_name`
  - `llm.tool_choice.mode`
  - `llm.retry.max_attempts`
  - `llm.request.timeout_ms`
- Search generation models:
  - `search.intent_resolve.model`
  - `search.content_generation.model`
  - `search.spelling_correction.model`
  - `search.spelling_correction.mode`
- Search UX data:
  - `search.example_queries*`
  - `search.recent.*`
- Filetype controls:
  - `search.filetype.allowlist`
- ETA controls:
  - `search.article_generation_eta.enabled`
  - `search.article_generation_eta.sample_size`

Notes:
- Search ETA endpoint is action-scoped: `/api/search/eta?action=preview|content`.
- `preview` uses one-call query preview generation timing.
- `content` uses on-demand full article content generation timing.

## `.env` Loading Order

Backend loads env from:

1. `<appDataPath>/.env`
2. `<cwd>/.env` (overrides step 1)
3. existing process env
