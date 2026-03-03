# 2026-03-02 Cross-Repo Dedup Refactor

## Goal
Reduce duplicated helper logic and route boilerplate across `chat-api`, `interface`, and `cli` without changing runtime behavior.

## Scope
- Shared bearer-token parsing helper.
- Shared request-user context setter from headers.
- Shared request-body summarization helper.
- Shared cache helper usage for profile lookup.
- Registry-backed AI tool wrapper extraction.
- Address normalization alignment to viem semantics (`getAddress(...).toLowerCase()`).

## Risks and Guards
- Keep auth and route responses behaviorally equivalent.
- Preserve existing error payload contracts.
- Preserve tool output/error envelope semantics.

## Verification
- `pnpm docs:drift`
- `pnpm docs:gardening`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`

## Status
Completed implementation; verification in progress.
