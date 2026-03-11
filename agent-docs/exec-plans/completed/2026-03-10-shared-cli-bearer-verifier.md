# 2026-03-10 Shared CLI Bearer Verifier

## Goal

Adopt the shared `wire` CLI bearer verifier in `chat-api` so tools bearer auth, active-session checks, and scope enforcement stay aligned with other consumers.

## Scope

- Switch `src/api/oauth/jwt.ts` to shared JWT verification helpers where possible.
- Switch `src/api/tools/token-auth.ts` to the shared bearer verifier with repo-local session lookup.
- Update focused auth tests and security docs if implementation notes change.

## Out Of Scope

- OAuth mint/refresh/revoke behavior changes.
- Chat-user auth flow changes.
- Tool registry contract changes.

## Risks and Guards

- Preserve current `401` behavior for missing/invalid/revoked tokens.
- Preserve current session scope match enforcement.
- Do not loosen tool scope enforcement or request-context principal shape.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

## Status

Status: completed
Updated: 2026-03-10
Completed: 2026-03-10
