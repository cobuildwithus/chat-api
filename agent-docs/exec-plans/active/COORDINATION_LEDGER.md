# Coordination Ledger (Active Only)

Use this file only for currently active coding work. Keep it minimal and current.

## Open Entries

| Agent/Session | Task | Files in Scope | Symbols (add/rename/delete) | Dependency Notes | Updated (YYYY-MM-DD) |
| --- | --- | --- | --- | --- | --- |
| codex-farcaster-wallet-link-route | Add a CLI-authenticated Farcaster wallet-link persistence route for agent signup flows. | `src/api/farcaster-wallet-link/**`, `src/api/server.ts`, `src/api/tools/token-auth.ts`, `src/api/auth/principals.ts`, `src/infra/db/queries/profiles/persist-wallet-link.ts`, matching tests/docs` | add wallet-execute auth enforcement, add Farcaster wallet-link request parser/handler, add profile upsert helper | Keep scope limited to `farcaster.profiles`; do not expand into linked social accounts or tool registry flows | 2026-03-11 |
## Rules

1. Add a row before your first code edit for every coding task (single-agent and multi-agent).
2. Update your row immediately when scope or symbol-change intent changes.
3. Before deleting or renaming a symbol, check this table for dependencies.
4. Delete your row as soon as the task is complete or abandoned.
5. Leave only the header and empty table when there is no active work.
