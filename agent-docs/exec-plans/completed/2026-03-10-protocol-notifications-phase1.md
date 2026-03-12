# 2026-03-10 Protocol Notifications Phase 1

## Goal

Expose usable protocol notification summaries and app paths from the existing wallet notifications tool output.

## Scope

- Extend notification mapping so `kind='protocol'` rows produce titles, excerpts, and app paths from structured payload data.
- Keep the existing `list-wallet-notifications` tool contract intact.

## Constraints

- Reuse the existing inbox tables; no new chat-api persistence.
- Keep rendering logic aligned with interface notification copy/path behavior.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
