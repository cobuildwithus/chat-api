# Tool Catalog Reference

Source registry: `src/ai/tools/index.ts`.

## `getUser`

- Path: `src/ai/tools/get-user/tool.ts`
- Input: `fname`
- Purpose: fetch exact/fuzzy Farcaster user profile summary from DB.
- Dependencies: Postgres + Redis cache/lock path.
- Failure behavior: DB/infra errors may propagate; cache lock timeout falls back to direct fetch.

## `getCast`

- Path: `src/ai/tools/get-cast/get-cast.ts`
- Input: cast `identifier` + `type` (`hash`/`url`)
- Purpose: fetch cast details via Neynar.
- Dependencies: `NEYNAR_API_KEY`, Neynar service.
- Timeout: `NEYNAR_REQUEST_TIMEOUT_MS`.
- Failure behavior: missing API key returns structured error; runtime exceptions return `null`.

## `castPreview`

- Path: `src/ai/tools/cast-preview/cast-preview.ts`
- Input: draft cast content (`text`, `embeds`, `parent`).
- Purpose: echo/validate draft cast payload shape.
- Dependencies: none external.
- Failure behavior: schema-level validation failures only.

## `getCobuildAiContext`

- Path: `src/ai/tools/cobuild-ai-context/tool.ts`
- Input: none
- Purpose: fetch latest AI context from co.build endpoint.
- Dependencies: external `https://co.build/api/cobuild/ai-context`.
- Timeout: `COBUILD_AI_CONTEXT_TIMEOUT_MS`.
- Failure behavior: returns `{ error }` payload rather than throwing.

## `file_search` (conditional)

- Path: `src/ai/tools/docs/docs.ts`
- Purpose: search documentation vector store.
- Enabled only when `DOCS_VECTOR_STORE_ID` exists.
- Dependencies: OpenAI Responses/file-search.
- Timeout: `OPENAI_REQUEST_TIMEOUT_MS` via model client fetch wrapper.

## `web_search`

- Path: `src/ai/tools/web-search/web-search.ts`
- Purpose: retrieve web search context for current/recent facts.
- Dependencies: OpenAI web search tool.
- Timeout: `OPENAI_REQUEST_TIMEOUT_MS` via model client fetch wrapper.

## Update Rule

When adding/removing/modifying any tool, update this catalog and `docs/TOOLS.md` in the same PR.
