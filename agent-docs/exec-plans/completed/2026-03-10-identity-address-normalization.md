# Identity Address Normalization

## Goal

Replace chat-api-local address normalization and CLI bearer principal derivation with the canonical shared helpers exported by `@cobuild/wire`.

## Success Criteria

- `src/chat/address.ts` no longer owns unique normalization behavior.
- Tools bearer auth derives principals from verified claims through `wire`.
- Tests cover the shared cutover and preserve current public behavior.

## Scope

- `src/chat/address.ts`
- `src/api/auth/principals.ts`
- `src/api/tools/token-auth.ts`
- `src/api/tools/internal-auth.ts`
- matching tests/docs if needed

## Out Of Scope

- Chat grant removal work.
- Other auth/public-error changes already in flight outside this scope.

## Risks / Constraints

- Preserve request-context principal shapes expected by existing tools/routes.
- Do not widen accepted network/address behavior beyond the hard cutover plan.
- Do not overwrite unrelated in-flight edits in the repo.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

## Current Status

- The shared-wire cutover is implemented and focused auth/address tests pass.
- `pnpm typecheck` is currently blocked by unrelated repo issues: existing schema-test readonly typing mismatches plus `@cobuild/wire/protocol-notifications` local-link module-resolution problems outside this slice.
- Full `pnpm test` is currently blocked by unrelated in-tree failures, including missing `src/tools/registry/wallet` imports and notification-contract regressions outside this normalization scope.
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
