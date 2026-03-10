# 2026-03-10 OAuth + Tool Contract Cutover

## Goal

Replace repo-local OAuth and `/v1/tools*` route DTO parsing/serialization with the shared `@cobuild/wire` contract surface.

## Scope

- Swap `src/api/oauth/schema.ts` request definitions to shared `wire` validators/types.
- Use shared `wire` serializers/parsers in `src/api/oauth/route.ts`.
- Swap `src/api/tools/schema.ts` request definitions to shared `wire` validators/types.
- Use shared `wire` tool response envelopes in `src/api/tools/route.ts`.
- Update focused tests/docs for the canonical contract.

## Constraints

- Hard cutover only.
- Preserve existing auth and route registration behavior.
- Avoid unrelated registry/runtime changes already in flight.

## Planned Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

## Verification Outcome

- `pnpm typecheck` passed.
- `pnpm test` passed.
- `pnpm test:coverage` passed.
- `bash scripts/check-agent-docs-drift.sh` passed.
- `bash scripts/doc-gardening.sh --fail-on-issues` passed.

## Status

completed
