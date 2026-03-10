# Coordination Ledger (Active Only)

Use this file only for currently active coding work. Keep it minimal and current.

## Open Entries

| Agent/Session | Task | Files in Scope | Symbols (add/rename/delete) | Dependency Notes | Updated (YYYY-MM-DD) |
| --- | --- | --- | --- | --- | --- |
| Codex-main-phase2-inspect | Indexed protocol inspect tools for TCR/dispute/stake/premium surfaces | `src/infra/db/schema/**`, `src/domains/protocol/**`, `src/tools/registry.ts`, `src/ai/tools/**`, `tests/**`, `agent-docs/**`, `docs/TOOLS.md` | Add direct-DB schema bindings plus `get-tcr-request`/`get-dispute`/`get-stake-position`/`get-premium-escrow` readers, registry executors, AI wrappers, and tests | Indexed DB only; avoid overlap with unrelated notifications work and keep tool surface read-only | 2026-03-10 |
## Rules

1. Add a row before your first code edit for every coding task (single-agent and multi-agent).
2. Update your row immediately when scope or symbol-change intent changes.
3. Before deleting or renaming a symbol, check this table for dependencies.
4. Delete your row as soon as the task is complete or abandoned.
5. Leave only the header and empty table when there is no active work.
