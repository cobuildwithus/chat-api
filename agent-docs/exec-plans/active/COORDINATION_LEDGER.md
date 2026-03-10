# Coordination Ledger (Active Only)

Use this file only for currently active coding work. Keep it minimal and current.

## Open Entries

| Agent/Session | Task | Files in Scope | Symbols (add/rename/delete) | Dependency Notes | Updated (YYYY-MM-DD) |
| --- | --- | --- | --- | --- | --- |
| Codex / chat-grant-cutover | Remove chat grant auth/idempotency primitive and collapse chat auth to wallet ownership only | `src/api/chat/**`, `src/api/server.ts`, `src/chat/**`, `src/config/env.ts`, matching `tests/**`, matching `agent-docs/**`, `README.md`, `ARCHITECTURE.md` | Delete `signChatGrant`/`verifyChatGrant`, remove chat grant headers/payload fields/env contract, tighten docs/tests to ownership-only auth model | Must preserve existing wallet ownership checks and avoid overlapping unrelated notification edits | 2026-03-10 |
| Codex / public-error-map | Centralize stable public error mapping for chat, tools, and context routes | `src/api/auth/**`, `src/api/chat/**`, `src/api/cobuild-ai-context/**`, `src/api/tools/**`, `src/api/server-helpers.ts`, `src/tools/registry.ts`, matching `tests/**`, matching `agent-docs/**` | Add shared public error definitions/builders; replace scattered route/tool error strings and external failure mapping | Preserve current status-code semantics while eliminating raw upstream failure text from public responses | 2026-03-10 |
## Rules

1. Add a row before your first code edit for every coding task (single-agent and multi-agent).
2. Update your row immediately when scope or symbol-change intent changes.
3. Before deleting or renaming a symbol, check this table for dependencies.
4. Delete your row as soon as the task is complete or abandoned.
5. Leave only the header and empty table when there is no active work.
