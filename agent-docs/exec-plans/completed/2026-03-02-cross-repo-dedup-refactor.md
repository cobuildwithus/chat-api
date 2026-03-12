# 2026-03-02 Cross-Repo Dedup Refactor

## Goal
Reduce duplicated helper logic and route boilerplate across `chat-api`, `interface`, and `cli` without changing runtime behavior.

## Scope
- Shared bearer-token parsing helper.
- Shared OAuth scope/capability helpers and JWT-claim parsing from `@cobuild/wire`.
- Shared request-user context setter from headers.
- Shared request-body summarization helper.
- Shared cache helper usage for profile lookup.
- Registry-backed AI tool wrapper extraction.
- Address normalization alignment to viem semantics (`getAddress(...).toLowerCase()`).
- Shared OAuth security helpers (PKCE/redirect/session label validation), plus transactional auth-code exchange and refresh rotation wrappers.

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
Completed implementation and verification on 2026-03-03.
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
