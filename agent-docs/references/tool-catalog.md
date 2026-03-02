# Tool Catalog Reference

Source registries:
- Canonical REST tools: `src/api/tools/registry.ts`
- AI wrappers: `src/ai/tools/index.ts`

## `getUser`

- Canonical name: `get-user`
- AI wrapper: `getUser`
- Purpose: fetch exact/fuzzy Farcaster profile summary from DB.
- Dependencies: Postgres + Redis cache/lock path.

## `getCast`

- Canonical name: `get-cast`
- AI wrapper: `getCast`
- Purpose: fetch cast details via Neynar by hash or URL.
- Dependencies: `NEYNAR_API_KEY`, Neynar service.
- Timeout: `NEYNAR_REQUEST_TIMEOUT_MS`.

## `listDiscussions`

- Canonical name: `list-discussions`
- AI wrapper: `listDiscussions`
- Purpose: list top-level Cobuild discussion posts with sorting/pagination.
- Dependencies: `farcaster.casts`, `farcaster.profiles`.

## `getDiscussionThread`

- Canonical name: `get-discussion-thread`
- AI wrapper: `getDiscussionThread`
- Purpose: load one discussion thread with pagination and optional focus hash.
- Dependencies: `farcaster.casts`, `farcaster.profiles`.

## `semanticSearchCasts`

- Canonical name: `semantic-search-casts`
- AI wrapper: `semanticSearchCasts`
- Purpose: semantic retrieval over Cobuild casts using pgvector embeddings.
- Dependencies: OpenAI embeddings API + `farcaster.casts.text_embedding` (`vector(256)`).
- Timeout: `OPENAI_REQUEST_TIMEOUT_MS`.
- Error semantics: returns `503` when OpenAI API key is not configured; `502` for upstream embedding failures.

## `replyToCast`

- Canonical name: `reply-to-cast`
- AI wrapper: `replyToCast`
- Purpose: publish a Farcaster reply to a parent cast hash via Neynar.
- Guardrails: requires `confirm=true`; strict hash/UUID/input validation.
- Dependencies: `NEYNAR_API_KEY`, Neynar service.
- Timeout: `NEYNAR_REQUEST_TIMEOUT_MS`.

## `castPreview`

- Canonical name: `cast-preview`
- AI wrapper available in code (`castPreviewTool`) for draft payload normalization.
- Purpose: echo/validate cast draft payload shape for approval flows.

## `get-treasury-stats`

- AI wrapper: `get-treasury-stats`
- Purpose: fetch the latest treasury stats snapshot.
- Dependencies: treasury stats snapshot service.

## `file_search` (conditional)

- Canonical alias: `docs.search` / `file_search`
- AI wrapper: provider-native `file_search`
- Enabled only when `DOCS_VECTOR_STORE_ID` exists.
- Input guardrails: docs-search query text is bounded to 1000 characters.

## `web_search`

- AI wrapper: provider-native `web_search`
- Purpose: retrieve web context for recent facts.

## Update Rule

When adding/removing/modifying any tool, update this catalog and `docs/TOOLS.md` in the same PR.
