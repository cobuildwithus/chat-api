# 2026-03-12 Chat Simplification Audit

## Goal
Implement the behavior-preserving simplifications from the chat-api audit for chat request handling, chat auth/helpers, and tool auth/runtime surfaces while keeping existing API contracts intact.

## Scope
- `src/api/chat/**`
- `src/api/auth/**`
- `src/tools/**`
- `src/domains/notifications/**`
- `src/ai/**`
- `src/config/env.ts`
- matching `tests/**`
- execution/behavior docs if implementation changes require them

## Risks and Guards
- Preserve chat route behavior, especially ownership masking, idempotency, pending-message cleanup, stream error handling, and quota settlement.
- Keep route schema/runtime parsing aligned from a single source to avoid chat data drift.
- Avoid overlapping worker edits by assigning disjoint file ownership in the coordination ledger before code changes.
- Treat stale env compatibility surfaces as removable only when runtime references are absent; keep tests aligned with intended support.

## Verification
- `pnpm wire:ensure-published`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
- completion workflow: `simplify` -> `test-coverage-audit` -> `task-finish-review`

## Status
In progress. Worker slices: chat route/data consolidation, auth/tools simplification, and dead-surface cleanup plus stale single-variant pruning.
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
