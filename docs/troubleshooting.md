# Troubleshooting

## Backend Not Starting

- Check env values:
  - `YAH_PORT` must be valid integer port.
  - `YAH_ON_DB_SCHEMA_CONFLICT` must be `quit` or `backup-and-overwrite`.
- Confirm Node.js 20+ is installed.

## Frontend Cannot Reach API

- Ensure `yah start` is running.
- Open `http://127.0.0.1:11111` directly.
- If you changed host/port, verify `YAH_HOST` and `YAH_PORT`.

## Migration Conflict

If schema checksum conflict appears, use a fresh local DB or reset:

```bash
yah db reset --yes
```

## API Key / Provider Issues

- Confirm `YAH_MAGIC_PROVIDER`.
- Confirm `llm.api_key.env_name` in `/config`.
- Export matching env var before start (for example `OPENAI_API_KEY`).

## Config Page Unavailable

- Ensure `YAH_ENABLE_CONFIG_ROUTES=1` (default).

## ETA Looks Static or Missing

- Ensure timing runs exist (`/generation-performance`).
- ETA falls back to default baseline when no history is available.
- Tune:
  - `search.article_generation_eta.enabled`
  - `search.article_generation_eta.sample_size`
