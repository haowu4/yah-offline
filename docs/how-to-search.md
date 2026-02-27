# How To Search

## Core Idea

yah is strongest when it generates explanations from relatively stable knowledge.
yah is weaker when the answer depends on rapidly changing real-world data.

The quality of a result is mostly determined by one question:
is this query about stable concepts, or about live facts?

## Those Query Choices Work Well

- Concept explanations (stable fundamentals)
  - `insulin resistance explained`: core medical concept, good for high-level understanding
  - `tcp vs udp differences`: networking fundamentals are stable and structured
- Reference-style learning content
  - `laplace transform table`: established math reference, low volatility
  - `world war i causes`: historical topic with mature source material
- Technical mechanism breakdowns
  - `sqlite fts5 bm25 explanation`: implementation concepts are stable enough for useful summaries
  - `how oauth2 authorization code flow works`: protocol flow is mostly stable and well-documented
- Format-specific generation (with `filetype:`)
  - `ubuntu install zsh filetype:sh`: asks for shell-script output for setup steps
  - `quicksort implementation filetype:py`: asks for Python code output
  - `study notes about tcp congestion control filetype:md`: asks for markdown notes output

Why these tend to work:

- Facts change slowly.
- The model can focus on explanation quality instead of guessing current numbers.

## Bad Query Choices (For Now)

Currently yah does not have an up-to-date source-of-truth retrieval layer.
Because of that, time-sensitive queries are risky and can be stale.

- Live prices and market values
  - `nyc hotel price`: prices change constantly by date and inventory
  - `btc price`: real-time value query, generation alone is not reliable
- Schedules and availability
  - `nba schedule 2028`: schedule data changes and should come from a live source
  - `flight status ua123`: operational status is live data
- News and policy
  - `breaking tech news`: freshness is the core requirement
  - `current visa policy for country x`: policy can change and needs current official source

What to do for these:

- Use yah to draft structure/checklists/questions.
- Verify final facts with live authoritative sources.

## Important Warning

AI can generate mistakes even on good query types.
Always use common sense, especially when the result may affect money, safety, legal decisions, or travel plans.

## Advanced Tricks

### Query Operator: `filetype`

`filetype:` changes output format only.

Examples:

- `ubuntu install zsh filetype:sh`: aims to generate a runnable shell script for Ubuntu setup.
- `quicksort implementation filetype:py`: aims to generate Python source code instead of markdown explanation.
- `trip checklist filetype:md`: aims to generate a readable markdown checklist document.

Rules:

- Only one `filetype:` operator is allowed per query.
- Multiple operators return HTTP `400`.
- Filetype must be in `search.filetype.allowlist`.
- `filetype:md` explicitly forces markdown output.
