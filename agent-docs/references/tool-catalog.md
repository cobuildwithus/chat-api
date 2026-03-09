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
- Purpose: fetch cast details by hash from `farcaster.casts` + `farcaster.profiles`.
- Dependencies: Postgres + Redis cache/lock path.

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

## `castPreview`

- Canonical name: `cast-preview`
- AI wrapper available in code (`castPreviewTool`) for draft payload normalization.
- Purpose: echo/validate cast draft payload shape for approval flows.

## `get-treasury-stats`

- AI wrapper: `get-treasury-stats`
- Purpose: fetch the latest treasury stats snapshot.
- Dependencies: treasury stats snapshot service.

## `get-wallet-balances`

- Canonical name: `get-wallet-balances`
- Canonical aliases: `getWalletBalances`, `walletBalances`
- Purpose: fetch ETH + USDC balances for the authenticated CLI wallet.
- Dependencies: Base/Base Sepolia JSON-RPC + USDC ERC-20 `balanceOf`.
- Cache: lock-backed Redis cache (30s TTL), keyed by `<network>:<wallet>`.

## `list-wallet-notifications`

- Canonical name: `list-wallet-notifications`
- Canonical aliases: `listWalletNotifications`, `walletNotifications`
- Purpose: list notification inbox items for the authenticated subject wallet with cursor pagination and wallet-wide unread metadata.
- Dependencies: `cobuild.notifications`, `cobuild.notification_state`, `farcaster.casts`, `farcaster.profiles`.
- Cache: none (`Cache-Control: no-store`) because unread/read freshness matters.

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
