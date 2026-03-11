# 2026-03-10 CLI Audit Remediation

## Goal

Close the chat-api auth and reliability findings from the 2026-03-10 audit by making CLI bearer auth revocation-aware, preventing cache lock timeout herd behavior, and removing redundant chat-list goal filtering.

## Scope

- `src/api/tools/token-auth.ts`
- `src/api/oauth/jwt.ts`
- `src/api/oauth/store.ts`
- `src/infra/cache/cacheResult.ts`
- `src/api/chat/list.ts`
- Matching tests and durable docs that describe the auth/runtime contract

## Risks and Guards

- Revoked or expired CLI sessions must fail closed without exposing token details.
- Cache lock timeout handling must prefer bounded wait/recheck behavior over duplicate expensive fetches.
- Chat list ownership filtering must remain user-scoped.
- Hosted wallet balance semantics remain a follow-up dependency while another active ledger entry owns `src/tools/registry/wallet.ts`.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

## Status

Completed.
