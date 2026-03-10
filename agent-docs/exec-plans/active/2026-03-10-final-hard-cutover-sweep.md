# 2026-03-10 Final Hard Cutover Sweep

## Goal

Delete the remaining chat-api-local address wrapper and point the final auth/chat consumers at the shared `@cobuild/wire` helpers.

## Scope

- `src/api/chat/list.ts`
- `src/api/chat/route.ts`
- `src/api/oauth/store.ts`
- `src/chat/address.ts`
- matching `tests/**`

## Constraints

- Preserve wallet-ownership and OAuth owner-address behavior.
- Do not add local compatibility helpers.
- Avoid unrelated notification/tool work already in flight.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

## Status

completed
