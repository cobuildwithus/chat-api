# Coordination Ledger (Active Only)

Use this file only for currently active coding work. Keep it minimal and current.

## Open Entries

| Agent/Session | Task | Files in Scope | Symbols (add/rename/delete) | Dependency Notes | Updated (YYYY-MM-DD) |
| --- | --- | --- | --- | --- | --- |
| codex-gpt5-oauth-pkce-cutover-2026-03-03 | Replace PAT auth with OAuth Authorization Code + PKCE, JWT access tokens, rotating refresh sessions | `src/api/server.ts`, `src/api/tools/internal-auth.ts`, `src/api/tools/token-auth.ts`, `src/api/tools/route.ts`, `src/api/tokens/*`, `src/config/env.ts`, `src/infra/db/schema.ts`, `src/api/oauth/*`, `migrations/*`, `tests/api/**`, `tests/config/env.spec.ts`, `tests/infra/db/schema.spec.ts` | add oauth authorize/token/session handlers; add JWT signer/verifier helpers; add oauth code/session DB tables; remove token-id principal usage | Full auth cutover requested across chat-api/interface/cli; maintain tool auth invariants and rate-limit keying | 2026-03-03 |

## Rules

1. Add a row before your first code edit for every coding task (single-agent and multi-agent).
2. Update your row immediately when scope or symbol-change intent changes.
3. Before deleting or renaming a symbol, check this table for dependencies.
4. Delete your row as soon as the task is complete or abandoned.
5. Leave only the header and empty table when there is no active work.
