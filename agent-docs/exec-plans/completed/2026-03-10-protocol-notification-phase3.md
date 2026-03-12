# 2026-03-10 Protocol Notification Phase 3

## Goal

Expose clean wallet-notification summaries for the new actionable financial/exposure protocol reasons.

## Scope

- Add title/excerpt/app-path presentation for `underwriter_withdrawal_prep_required`, `underwriter_withdrawal_prep_complete`, `premium_claimable`, and `premium_claimed`.
- Preserve the existing wallet notifications tool contract.
- Keep unknown-reason fallback behavior intact.

## Constraints

- Follow the upstream semantic reason contract.
- Do not add operator-alert-specific handling in this phase.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`

## Outcome

- Added wallet-notification presentation for the new actionable financial/exposure reasons.
- `src/domains/notifications/presentation.test.ts` passed.
- Repo-wide `pnpm typecheck`, `pnpm test`, and `pnpm test:coverage` remain blocked by unrelated in-progress indexed protocol inspect changes in `src/domains/protocol/**`, `src/tools/registry.ts`, and their tests.
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
