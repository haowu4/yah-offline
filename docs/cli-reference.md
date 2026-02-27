# CLI Reference

Use:

```bash
npx @ootc/yah <command>
```

## Commands

Start app server:

```bash
npx @ootc/yah start
```

Reset DB:

```bash
npx @ootc/yah db reset --yes
```

Initialize DB and run migrations:

```bash
npx @ootc/yah db init
```

Edit app-data `.env` file:

```bash
npx @ootc/yah env edit
```

Print app-data `.env` file location:

```bash
npx @ootc/yah env location
```

List runtime config:

```bash
npx @ootc/yah config list
```

Get one config key:

```bash
npx @ootc/yah config get search.content_generation.model
```

Set config key:

```bash
npx @ootc/yah config set search.article_generation_eta.sample_size -v 30
```

Set config key in editor:

```bash
npx @ootc/yah config set search.filetype.allowlist -e
```

Apply preset:

```bash
npx @ootc/yah config preset openai
```
