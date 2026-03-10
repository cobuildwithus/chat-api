# 2026-03-10 Centralize Public Errors

## Goal

Move public-facing error mapping for chat routes, canonical tool routes/execution, and the Cobuild AI context route behind a shared module so external responses stay stable and do not expose ad hoc upstream strings.

## Constraints

- Preserve current status-code semantics unless a stability fix clearly requires otherwise.
- Avoid overwriting unrelated in-flight work recorded in `COORDINATION_LEDGER.md`.
- Keep user-actionable validation/auth errors specific where helpful; collapse backend failure details to stable public messages.

## Working Scope

- `src/api/auth/**`
- `src/api/chat/**`
- `src/api/cobuild-ai-context/**`
- `src/api/tools/**`
- `src/api/server-helpers.ts`
- `src/tools/registry.ts`
- matching `tests/**`
- matching `agent-docs/**`

## Plan

1. Add a shared public-error definition/helper module.
2. Route chat/auth/context/tools responses through shared helpers.
3. Replace dynamic tool execution backend failure strings with stable mapped errors.
4. Update tests and docs.
5. Run completion workflow passes and required checks.

## Status

completed
