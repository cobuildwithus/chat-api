# Tool Catalog Reference

Source registries:
- Canonical REST tools manifest: `src/tools/registry.ts`
- Canonical REST tool domains: `src/tools/registry/{farcaster,wallet,protocol,context}.ts`
- AI wrappers: `src/ai/tools/index.ts`

Validation source of truth:
- Registry-backed AI wrappers reuse the canonical Zod input validators from `src/tools/registry.ts`; wrapper-local prompts/descriptions may differ, but validation must not drift.

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
- Error semantics: returns stable public errors, using `503`/`Tool is unavailable.` when embeddings config is missing and `502`/`Tool request failed.` for execution failures.

## `castPreview`

- Canonical name: `cast-preview`
- AI wrapper available in code (`castPreviewTool`) for draft payload normalization.
- Purpose: echo/validate cast draft payload shape for approval flows.

## `get-treasury-stats`

- AI wrapper: `get-treasury-stats`
- Purpose: fetch the latest treasury stats snapshot.
- Dependencies: treasury stats snapshot service.
- Error semantics: returns stable public `502`/`Tool request failed.` when the snapshot service is unavailable.

## `get-revnet-issuance-terms`

- Canonical name: `get-revnet-issuance-terms`
- Canonical aliases: `getRevnetIssuanceTerms`, `revnetIssuanceTerms`
- Purpose: fetch indexed revnet issuance terms, summary, and timeline data for a project.
- Inputs: optional `projectId` and `chainId` overrides; omitted `projectId` falls back to the default Cobuild project configured by the infra layer.
- Output: indexed `baseAsset`/`token` metadata, wire-backed issuance summary, stage list, and chart data.
- Dependencies: `cobuild-onchain.project`, `cobuild-onchain.ruleset`, `cobuild.token_metadata`, shared `@cobuild/wire` issuance helpers.
- Error semantics: returns stable public `502`/`Tool request failed.` when indexed issuance data cannot be produced.

## `getGoal`

- Canonical name: `get-goal`
- Canonical aliases: `getGoal`, `goal.inspect`
- AI wrapper: `getGoal`
- Purpose: inspect indexed goal state by goal treasury address, canonical route slug, or canonical route domain.
- Output: concise DB-derived goal summary including `goalAddress`, `goalRevnetId`, lifecycle state/finalization, canonical project/route linkage, flow/stake relationships, treasury summary, governance linkage, and a compact budgets summary.
- Dependencies: `cobuild-onchain.goal_treasury`, `goal_factory_deployment`, `goal_context_by_budget_treasury`, `budget_treasury`, `flow_recipient`, `stake_vault`.
- Error semantics: missing goals return `404` / `Goal not found.`; ambiguous canonical route identifiers return `409` / `Goal identifier is ambiguous. Use a canonical address instead.`

## `getBudget`

- Canonical name: `get-budget`
- Canonical aliases: `getBudget`, `budget.inspect`
- AI wrapper: `getBudget`
- Purpose: inspect indexed budget state by budget treasury address or recipient id.
- Output: concise DB-derived budget summary including `budgetAddress`, `recipientId`, parent `goalAddress`, `budgetTcr`, lifecycle state/finalization, treasury summary, flow linkage, and governance/premium linkage.
- Dependencies: `cobuild-onchain.budget_treasury`, `goal_context_by_budget_treasury`, `goal_treasury`, `goal_factory_deployment`, `flow_recipient`, `premium_escrow`.

## `getTcrRequest`

- Canonical name: `get-tcr-request`
- Canonical aliases: `getTcrRequest`, `tcr.request`, `cli.get-tcr-request`
- AI wrapper: `getTcrRequest`
- Purpose: inspect indexed TCR request state by canonical composite request id (`<tcrAddress>:<itemId>:<requestIndex>`).
- Output: concise DB-derived request summary including TCR kind/address, item status, request actors/timing, related goal/budget context, and linked dispute summary when present.
- Dependencies: `cobuild-onchain.tcr_request`, `tcr_item`, `arbitrator_dispute`, `goal_treasury`, `goal_context_by_budget_tcr`, `budget_treasury`, `budget_treasury_by_recipient`.

## `getDispute`

- Canonical name: `get-dispute`
- Canonical aliases: `getDispute`, `dispute.inspect`, `cli.get-dispute`
- AI wrapper: `getDispute`
- Purpose: inspect indexed arbitrator dispute state by canonical composite dispute id (`<arbitrator>:<disputeId>`).
- Output: concise DB-derived dispute summary including dispute phase/ruling fields, related TCR request/budget/goal context, and optional per-juror membership + vote receipt detail when `juror` is provided.
- Dependencies: `cobuild-onchain.arbitrator_dispute`, `tcr_request`, `goal_treasury`, `budget_treasury`, `juror_dispute_member`, `juror_vote_receipt`, `juror`.

## `getStakePosition`

- Canonical name: `get-stake-position`
- Canonical aliases: `getStakePosition`, `stake.inspect`, `cli.get-stake-position`
- AI wrapper: `getStakePosition`
- Purpose: inspect indexed stake-vault account state by goal route/address, budget address/recipient id, or stake-vault address plus account address.
- Output: concise DB-derived stake summary including resolved vault identity, aggregate vault totals, zero-tolerant goal/cobuild account balances, and current juror state when present.
- Error semantics: ambiguous goal route identifiers return `409` / `Goal identifier is ambiguous. Use a canonical address instead.`
- Dependencies: `cobuild-onchain.goal_treasury`, `goal_context_by_budget_treasury`, `budget_treasury`, `stake_vault`, `stake_position`, `juror`.

## `getPremiumEscrow`

- Canonical name: `get-premium-escrow`
- Canonical aliases: `getPremiumEscrow`, `premiumEscrow.inspect`, `cli.get-premium-escrow`
- AI wrapper: `getPremiumEscrow`
- Purpose: inspect indexed premium escrow state by escrow address, budget treasury address, or budget stack id, with optional account detail.
- Output: concise DB-derived premium summary including escrow aggregate state, linked budget/budget-stack/goal context, timing fields, and optional per-account coverage/claimable/slash state.
- Dependencies: `cobuild-onchain.premium_escrow`, `premium_account`, `budget_treasury`, `budget_stack`, `goal_context_by_budget_treasury`, `goal_treasury`.

## `get-wallet-balances`

- Canonical name: `get-wallet-balances`
- Canonical aliases: `getWalletBalances`, `walletBalances`
- Purpose: fetch ETH + USDC balances for the hosted execution wallet associated with the authenticated CLI token.
- Dependencies: Base JSON-RPC + USDC ERC-20 `balanceOf`.
- Cache: lock-backed Redis cache (30s TTL), keyed by `<network>:<wallet>`.

## `list-wallet-notifications`

- Canonical name: `list-wallet-notifications`
- Canonical aliases: `listWalletNotifications`, `walletNotifications`
- Purpose: list notification inbox items for the authenticated subject wallet with cursor pagination and unread metadata scoped to the selected `kinds` filter (and wallet-wide when no filter is provided).
- Dependencies: `cobuild.notifications`, `cobuild.notification_state`, `farcaster.casts`, `farcaster.profiles`.
- Cache: none (`Cache-Control: no-store`) because unread/read freshness matters.
- Payload contract: discussion notifications expose `payload: null`; payment notifications expose a minimal DTO (`{ amount }` when present); protocol notifications expose the shared public protocol payload DTO parsed via `@cobuild/wire/protocol-notifications`.

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
