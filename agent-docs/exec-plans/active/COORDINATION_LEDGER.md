# Coordination Ledger (Active Only)

Use this file only for currently active coding work. Keep it minimal and current.

## Open Entries

| Agent/Session | Task | Files in Scope | Symbols (add/rename/delete) | Dependency Notes | Updated (YYYY-MM-DD) |
| --- | --- | --- | --- | --- | --- |
| Codex-main-protocol-notifs | Align wallet notification presentation with canonical arbitrator juror flow, remove reveal-deadline reminder handling, and add mechanism-governance copy | `src/domains/notifications/**`, `tests/**`, `agent-docs/**` | Delete `juror_reveal_deadline` copy branches; add mechanism notification copy; keep role-aware request-actor presentation | Depends on `indexer` reason/payload contracts plus `cobuild-keepers` scheduled delivery semantics | 2026-03-10 |
## Rules

1. Add a row before your first code edit for every coding task (single-agent and multi-agent).
2. Update your row immediately when scope or symbol-change intent changes.
3. Before deleting or renaming a symbol, check this table for dependencies.
4. Delete your row as soon as the task is complete or abandoned.
5. Leave only the header and empty table when there is no active work.
