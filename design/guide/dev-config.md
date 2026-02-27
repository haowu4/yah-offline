# Development Configuration (Environment Variables)

This document describes environment variables currently used by the system.

## Loading order

For the backend app (`packages/app`), env vars are loaded in this order:

1. `<appDataPath>/.env`
2. `<cwd>/.env` (overrides values from step 1)
3. Existing process environment

References:
- `packages/app/src/cli.ts`
- `packages/app/src/utils.ts`

## Backend (`packages/app`)

### Core `YAH_*` variables

| Variable | Default | Accepted values | Purpose |
|---|---|---|---|
| `YAH_STORAGE_PATH` | `<appDataPath>/data` | Any filesystem path | Storage directory for app data files. |
| `YAH_DB_PATH` | `<appDataPath>/app.db` | Any filesystem path | SQLite database file location. |
| `YAH_ON_DB_SCHEMA_CONFLICT` | `quit` | `quit`, `backup-and-overwrite` | Behavior when DB schema does not match expected schema. |
| `YAH_ENABLE_CONFIG_ROUTES` | `true` | `1`, `0`, `true`, `false` (case-insensitive) | Enables/disables config HTTP routes. |
| `YAH_HOST` | `127.0.0.1` | Hostname/IP string | Backend server bind host. |
| `YAH_PORT` | `11111` | Integer `1` to `65535` | Backend server port. |
| `YAH_API_KEY_SOURCE` | `env` | `env`, `keychain` | API key source selection. |
| `YAH_API_KEY` | Empty string | Any string | API key used when `YAH_API_KEY_SOURCE=env`. |

Notes:
- `YAH_API_KEY_SOURCE=keychain` is defined but currently not implemented and will throw at startup.
- Invalid boolean/port/mode values throw startup errors.

Reference:
- `packages/app/src/config.ts`

### Path base and platform env vars

These affect `appDataPath`, which in turn affects defaults for `YAH_STORAGE_PATH` and `YAH_DB_PATH`.

| Variable | Default behavior | Purpose |
|---|---|---|
| `YAH_BASE_FOLDER` | If set, used directly | Overrides base folder for app data path (`<YAH_BASE_FOLDER>/yah`). |
| `APPDATA` (Windows only) | `~/AppData/Roaming` fallback | Used as base path when `YAH_BASE_FOLDER` is not set on Windows. |
| `XDG_DATA_HOME` (Linux) | `~/.local/share` fallback | Used as base path when `YAH_BASE_FOLDER` is not set on Linux/other Unix-like systems. |

Reference:
- `packages/app/src/utils.ts`

### Development and CLI utility vars

| Variable | Default | Accepted values | Purpose |
|---|---|---|---|
| `USE_DEV_LLM` | Disabled | `"1"` enables dev LLM mode | Uses local/dev LLM implementations instead of OpenAI-backed implementations. |
| `EDITOR` | `vi` | Executable name/path | Editor used by `yah config set <key> -e`. |

References:
- `packages/app/src/llm/search.ts`
- `packages/app/src/llm/mail.ts`
- `packages/app/src/cli.ts`

## Frontend (`packages/frontend`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Base URL for frontend API clients. |

References:
- `packages/frontend/src/lib/api/config.ts`
- `packages/frontend/src/lib/api/mail.ts`
- `packages/frontend/src/lib/api/search.ts`

## Typical config usage

Below are two common development setups. Both include the same base config:

```env
YAH_ON_DB_SCHEMA_CONFLICT=backup-and-overwrite
YAH_API_KEY_SOURCE=env
YAH_ENABLE_CONFIG_ROUTES=1
YAH_DB_PATH=/tmp/yah-dev
```

### 1. Dev with fake LLM

Use this when you want to run locally without calling OpenAI.

```env
YAH_ON_DB_SCHEMA_CONFLICT=backup-and-overwrite
YAH_API_KEY_SOURCE=env
YAH_ENABLE_CONFIG_ROUTES=1
YAH_DB_PATH=/tmp/yah-dev
USE_DEV_LLM=1
```

Notes:
- `USE_DEV_LLM=1` switches search/mail generation to development-mode LLM implementations.
- `YAH_API_KEY` is not required in this mode.

### 2. Dev with a real LLM

Use this when you want real model responses from OpenAI.

```env
YAH_ON_DB_SCHEMA_CONFLICT=backup-and-overwrite
YAH_API_KEY_SOURCE=env
YAH_ENABLE_CONFIG_ROUTES=1
YAH_DB_PATH=/tmp/yah-dev
YAH_API_KEY=your_openai_api_key
```

Notes:
- Keep `YAH_API_KEY_SOURCE=env`.
- Do not set `USE_DEV_LLM=1` in this mode.
