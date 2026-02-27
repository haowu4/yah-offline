# yah

Local-first AI search and content generation app.

## Run (Package)

If you installed `@ootc/yah` globally:

```bash
yah start
```

Or run directly with npx:

```bash
npx @ootc/yah start
```

Open `http://127.0.0.1:11111`.

## Run From Source

1. Install dependencies:

```bash
pnpm install
```

2. Start backend:

```bash
pnpm -C packages/app dev
```

3. Start frontend:

```bash
pnpm -C packages/frontend dev
```

4. Open:
- Frontend: `http://127.0.0.1:5173` (or Vite-selected port)
- Backend API: `http://127.0.0.1:11111`

## User Docs

- [Getting Started](docs/getting-started.md)
- [How To Search](docs/how-to-search.md)
- [Config Reference](docs/config-reference.md)
- [CLI Reference](docs/cli-reference.md)
- [Observability](docs/observability.md)
- [Troubleshooting](docs/troubleshooting.md)

## Notes

- DB path is always `path.join(YAH_STORAGE_PATH, "yah.db")`.
- `YAH_DB_PATH` is not supported.

## Single-Server Build

Bundle frontend + docs into backend runtime:

```bash
pnpm build
```

Run one backend server to serve API + SPA + guides:

```bash
pnpm start:single
```

Maintainer reference:
- [Build And Bundle (From Source)](design/build-and-bundle.md)
