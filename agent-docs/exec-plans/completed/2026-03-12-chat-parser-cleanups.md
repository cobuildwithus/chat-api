# 2026-03-12 Chat Parser Cleanups

## Goal
Restore lossy stored chat-data hydration, remove stale compatibility/dead wrappers, and collapse duplicated chat-user typing without changing supported chat runtime behavior.

## Scope
- `src/api/chat/**`
- `src/api/auth/principals.ts`
- `src/ai/**`
- `src/config/env.ts`
- `src/infra/cobuild-ai-context.ts`
- `tests/api/chat/**`
- `tests/ai/tools/index.spec.ts`
- `tests/config/env.spec.ts`
- `tests/infra/cobuild-ai-context.spec.ts`
- matching `agent-docs/**`

## Risks and Guards
- Preserve strict request validation for chat creation while making storage hydration lossy for mixed-quality persisted JSON.
- Drop the stale chat-list `goalAddress` compatibility surface everywhere in one change so schemas, tests, and docs do not drift.
- Keep chat-user identity typing aligned across API and AI layers without weakening wallet-address normalization.

## Verification
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

## Status
Completed.
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
