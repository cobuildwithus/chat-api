# Wallet Notifications Review Fixes

## Goal

Fix the notification tooling issues found in review without expanding feature scope.

## Scope

- Preserve exact pagination sort keys, including null `event_at` handling.
- Fail closed on subject-wallet resolution and enforce notification scopes consistently.
- Remove lossy kind coercion and tighten output/schema behavior where practical.
- Add regression tests for the above.

## Constraints

- Keep notifications read-only in this pass.
- Do not widen AI tool exposure.
- Maintain current tool names and subject-wallet contract.

## Verification

- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`

