# How To Search

## Search Flow

1. Submit a query on `/search`.
2. Backend resolves intents from the query.
3. Backend generates one content item per intent.
4. Frontend streams progress and results.

## Query Types That Work Best

Core rule:

- Good fit: facts and explanations that are relatively stable
- Poor fit: facts that change frequently (price, schedule, news, policy, rankings)

### Good Fit: Stable Knowledge

Examples:

- `what is insulin resistance`
- `laplace transform table`
- `how sqlite fts5 bm25 works`
- `history of world war i causes`
- `difference between tcp and udp`

### Use With Caution: Mixed Stability

Examples:

- `best hotels in nyc for families`
- `python best practices`
- `visa requirements for country X`

Guidance:

- Treat output as a draft
- Verify important facts with current authoritative sources

### Poor Fit: Time-Sensitive Queries

Examples:

- `nyc hotel price`
- `nba schedule 2028`
- stock and crypto prices
- exchange rates
- flight status
- weather
- breaking news
- election results
- current laws/regulations

Why risky:

- Fluent output can still be outdated
- “Current” facts require live retrieval, not only generation

## Quick Decision Rule

Before trusting generated output, ask:

1. Could this fact change week-to-week or month-to-month?
2. Would being wrong cause cost, legal, or planning risk?
3. Does the query include terms like `latest`, `today`, `current`, `price`, `schedule`, `news`?

If yes, do not treat generated output as authoritative.

## `filetype:` Operator

Supported query operator example:

- `ubuntu install zsh filetype:sh`

Rules:

- Only one `filetype:` operator is allowed per query.
- Multiple operators return HTTP `400`.
- Filetype must be in `search.filetype.allowlist`.
- `filetype:md` explicitly forces markdown output.
- Non-markdown filetypes generate raw code/text output.
- `filetype` is applied to both intent resolution and content generation.
- `filetype:` controls output format, not freshness of facts.

## Result Pages

- Search home/results: `/search`
- Article/content: `/content/:slug`

Article page supports regeneration and shows related topics with direct links.

## ETA Behavior

- Search and article regeneration show:
  - elapsed time
  - typical total
  - ETA (or longer-than-usual)
- ETA is derived from recent generation timing logs with configurable sample size.
