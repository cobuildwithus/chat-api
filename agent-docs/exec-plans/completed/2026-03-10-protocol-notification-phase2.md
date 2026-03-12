# 2026-03-10 Protocol Notification Phase 2

## Goal

Render the new underwriter and juror protocol notification reasons cleanly in the wallet notifications API.

## Scope

- Extend protocol title/excerpt/app-path presentation for new reasons.
- Use `payload.role` to personalize request-actor notification copy and consume the upstream `proposer` role rename.
- Add focused tests for the new presentation branches.

## Constraints

- Preserve the existing notifications tool contract.
- Keep generic fallback behavior for unknown reasons.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
