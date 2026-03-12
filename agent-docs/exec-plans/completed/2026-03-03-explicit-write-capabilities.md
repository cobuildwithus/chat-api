# 2026-03-03 Explicit Write Capabilities

## Goal
Replace ambiguous `canWrite` in tools principal auth context with explicit write capability fields so authorization checks are easier to reason about.

## Scope
- `src/api/tools/token-auth.ts`
- `src/api/tools/internal-auth.ts`
- `src/api/tools/route.ts`
- `tests/api/tools/token-auth.spec.ts`
- `tests/api/tools/internal-auth.spec.ts`
- `tests/api/tools/route.spec.ts`
- `tests/api/server.spec.ts`

## Risks and Guards
- Preserve existing write-tool enforcement semantics: write tools still require both `tools:write` and `wallet:execute`.
- Keep request-context tooling principal shape explicit and consistent in tests.

## Verification
- `pnpm docs:drift`
- `pnpm docs:gardening`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`

## Status
Completed implementation; verification in progress.
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
