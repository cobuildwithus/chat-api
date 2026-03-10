# Remove chat grants as an auth primitive

Status: active
Created: 2026-03-10
Updated: 2026-03-10

## Goal

- Remove the `x-chat-grant`/`chatGrant` primitive from chat-api and rely on authenticated wallet ownership checks for chat reads and writes.

## Success criteria

- `/api/chat` no longer reads, verifies, or emits `x-chat-grant`.
- `/api/chat/new` returns only `chatId`.
- `/api/chat/:chatId` returns only chat payload JSON without grant headers.
- Chat grant signing/verification code and `CHAT_GRANT_SECRET` env dependency are deleted.
- Docs/tests describe wallet ownership as the only chat authorization gate.

## Scope

- In scope:
- `src/api/chat/**`
- `src/api/server.ts`
- `src/chat/**`
- `src/config/env.ts`
- matching `tests/**`
- matching `agent-docs/**`
- `README.md`
- `ARCHITECTURE.md`
- Out of scope:
- broader chat integrity hardening outside grant removal
- unrelated notification/runtime work already active in the repo

## Risks and mitigations

1. Risk: a downstream client still expects grant headers or `chatGrant` fields.
   Mitigation: update the known web consumer in the same change set and hard-cut docs/tests.
2. Risk: auth semantics drift in docs while behavior changes.
   Mitigation: update architecture, behavior, reliability, and API contract docs in the same edit set.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
