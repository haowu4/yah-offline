
## Search features

The LLM based search feature works as follow: 
User input a query, the server will first call a LLM api to infer the intention behind user's query. 

### intent resolution
for example, query: `ubuntu install git` may lead to intent: `how to install git on ubuntu`. and also `related intents`, i.e. `how to use git on ubuntu`

after server discover user's search intent, it will call another LLM apis for each intent to create article for it. 

For example, it may write an article titled `how to install git on ubuntu`, with slug `how-to-install-git-on-ubuntu`.

By default, articles are markdown based (`filetype:md`).

### filetype operator

Query supports a single `filetype:` operator, similar to Google.

- Example: `ubuntu install zsh filetype:sh`
- `filetype` is used in both intent resolution and content generation.
- `filetype:md` explicitly forces markdown output.
- Non-markdown filetypes generate raw text/code content.
- Only one `filetype:` operator is allowed per query. Multiple operators return HTTP `400`.
- Filetype must be in `search.filetype.allowlist` config. Any disallowed filetype returns HTTP `400`.

### article generation timing estimate

The server records generation run timing per article in DB. Search UI uses the average duration from recent runs to show expected time while loading.

Config keys:
- `search.article_generation_eta.enabled` (`1`/`0`)
- `search.article_generation_eta.sample_size` (how many recent completed runs to average)

intent and article are generated on each new search query, and results will be streamed back to user via a sse endpoint.

each query may be associated with multiple intents. 

### Pages

There are 3 pages:
- Search home page `/search`
- Search result page. `/search?query=`
- Article page `/content/:slug?`

#### Search home page

looks like google/bing home page (with one query input at center screen). search lead user to Search result page

#### Search result page

This page subscript to the sse endpoint to streaming the resutls of intent resolution and article creation. and display it as the backend creates.

This page looks similar to google resuslts page, but the resutls are grouped by intent. (item link to article page)

#### Article page `/content/:slug?query=`

This just show the content of the given article, which is markdown. it also show the related query, and other intent of this query (as side bar, similar to related contents in blog sites)
