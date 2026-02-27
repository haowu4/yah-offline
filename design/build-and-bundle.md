# Build And Bundle

This page is for maintainers building from source.

## Purpose

Build everything for single-server runtime:
- Frontend SPA assets
- Backend TypeScript output
- Runtime bundle (`public` + `docs`) for backend serving

## Prerequisites

- Node.js 20+
- pnpm 10+
- Dependencies installed from repo root:

```bash
pnpm install
```

## Full Build

From repo root:

```bash
pnpm build
```

This runs:
1. `pnpm build:frontend` -> builds `packages/frontend/dist`
2. `pnpm build:app` -> compiles backend in `packages/app`
3. `pnpm bundle:runtime` -> copies frontend dist + `docs/` into backend runtime folder

## Bundle Output

After `pnpm build`, runtime assets are placed under:

- `packages/app/runtime/public` (SPA static files)
- `packages/app/runtime/docs` (user guide markdown files)

## Run Single Server

From repo root:

```bash
pnpm start:single
```

This starts backend with:
- `YAH_PUBLIC_PATH=runtime/public`
- `YAH_DOCS_PATH=runtime/docs`

So one process serves:
- API endpoints
- Frontend SPA
- `/guide` docs content

## Build Steps Individually

```bash
pnpm build:frontend
pnpm build:app
pnpm bundle:runtime
```

