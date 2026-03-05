# 2026-02-25 Security Hardening Follow-up

## Goal
Close outstanding high/medium/low security findings in chat-api for docs-search auth/cost controls, self-hosted auth safety, error/log redaction, message integrity, and rate-limit defaults.

## Scope
- Route and middleware changes:
  - `src/api/server.ts`
  - `src/api/docs/search.ts`
  - `src/api/auth/validate-chat-user.ts`
  - `src/api/server-helpers.ts`
  - `src/config/env.ts`
- Chat storage/log hardening:
  - `src/chat/message-store.ts`
  - `src/chat/generate-title.ts`
  - `src/api/auth/get-user-from-token.ts`
- Verification + contract updates:
  - related tests under `tests/api/**`, `tests/chat/**`, `tests/config/**`
  - docs updates in `ARCHITECTURE.md`, `agent-docs/**`

## Invariants
- Chat route auth/grant behavior remains compatible.
- CLI tools prehandler ordering remains internal-auth then route limiter.
- Docs-search still returns existing payload shape on success.
- Startup continues to fail fast on invalid production-critical env.

## Plan
1. Add docs-search auth boundary and route-local limiter; harden outbound fetch timeout/redirect.
2. Harden self-hosted auth (production-safe guard + timing-safe shared-secret comparison).
3. Harden global error handler redaction/response safety.
4. Fix cross-chat message-id upsert integrity risk.
5. Reduce sensitive logging (title/raw provider body/auth failure noise).
6. Update tests, then run required checks and completion workflow audits.
7. Update architecture/security/contract docs and finalize commit.

## Risks
- Tightening docs-search auth may require interface callers to include internal header immediately.
- Message-id reconciliation changes must preserve idempotent updates for existing chat rows.
