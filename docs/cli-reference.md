# CLI Reference

Use:

```bash
yah <command>
```

## Commands

Start app server:

```bash
yah start
```

Reset DB:

```bash
yah db reset --yes
```

Initialize DB and run migrations:

```bash
yah db init
```

Edit app-data `.env` file:

```bash
yah env edit
```

Print app-data `.env` file location:

```bash
yah env location
```

List runtime config:

```bash
yah config list
```

Get one config key:

```bash
yah config get search.content_generation.model
```

Set config key:

```bash
yah config set search.article_generation_eta.sample_size -v 30
```

Set config key in editor:

```bash
yah config set search.filetype.allowlist -e
```

Apply preset:

```bash
yah config preset openai
```

If `yah` is not installed globally, prefix commands with:

```bash
npx @ootc/yah <command>
```
