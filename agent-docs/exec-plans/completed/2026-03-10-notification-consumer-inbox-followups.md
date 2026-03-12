# 2026-03-10 Notification Consumer Inbox Follow-ups

## Goal

Harden wallet notification consumer behavior in `chat-api` so scheduled protocol rows and same-timestamp notifications stay ordered and unread-state correct without waiting on new upstream reason additions.

## Scope

- Keep `@cobuild/wire` notification presentation as the source of truth.
- Align unread filtering with notification ordering semantics when multiple rows share the same `created_at`.
- Add regression coverage for scheduled/protocol wallet notification rows using currently available reasons and payload shapes.
- Avoid introducing repo-local reason parsing or presentation forks.

## Constraints

- Do not change the wallet notification tool contract shape beyond opaque watermark stability if required for correctness.
- Do not duplicate normalization logic that already lives in `@cobuild/wire`.
- Stay inside `src/domains/notifications/**` and matching tests.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
