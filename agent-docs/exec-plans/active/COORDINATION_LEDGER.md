# Coordination Ledger (Active Only)

Use this file only for currently active coding work. Keep it minimal and current.

## Open Entries

| Agent/Session | Task | Files in Scope | Symbols (add/rename/delete) | Dependency Notes | Updated (YYYY-MM-DD) |
| --- | --- | --- | --- | --- | --- |
| Codex | Fix review follow-ups for protocol notification presentation/read semantics | `src/domains/notifications/**`, matching `agent-docs/**` notes | Replace local protocol presentation/deep-link handling with shared `@cobuild/wire` presenter usage and align copy with web/source identity semantics | Must stay aligned with indexer payload contract, wire presenter contract, and interface renderer behavior | 2026-03-10 |
| Codex / integrity-hardening | Fix chat integrity, quota admission, tool exposure, and indexed-read review findings | `src/api/chat/**`, `src/chat/**`, `src/ai/**`, `src/api/tools/**`, `src/tools/registry.ts`, `src/infra/**`, `src/api/auth/**`, `src/domains/protocol/**`, `src/domains/notifications/service.ts`, matching `tests/**`, matching `agent-docs/**` | Add append-only chat request/storage helpers, server-auth chat POST contract, quota reservation + in-flight guards, explicit chat-safe tool exposure metadata, deterministic indexed lookup helpers/public DTO shaping | Do not overwrite existing `src/domains/notifications/presentation.ts` edits; keep protocol inspect semantics aligned with indexed DB state | 2026-03-10 |
| Codex / route-zod-parsers | Replace route-level JSON schema + handler casts with shared runtime parsers derived from Zod | `src/api/chat/**`, `src/api/tools/**`, `src/api/oauth/**`, shared route-schema helpers, matching `tests/api/**`, matching `agent-docs/**` | Add shared route parser/schema helpers; replace local request body/query/params type aliases/casts with parser exports for chat/tools/oauth routes | Avoid conflicts with existing chat/tools integrity-hardening work; keep endpoint wire contracts unchanged while consolidating validation | 2026-03-10 |
| Codex / explicit-principals | Split principal handling into explicit chat/tools/subject helpers | `src/api/auth/**`, `src/api/tools/**`, `src/domains/notifications/service.ts`, `src/domains/notifications/wallet-subject.ts`, `src/tools/registry.ts`, matching `tests/**`, matching `agent-docs/**` | Add `ChatUserPrincipal`/`ToolsPrincipal`/`SubjectWallet`; rename context/setter helpers around principal resolution | Preserve auth behavior; avoid overlapping route-parser changes and unrelated notification presentation edits | 2026-03-10 |
| Codex / chat-grant-cutover | Remove chat grant auth/idempotency primitive and collapse chat auth to wallet ownership only | `src/api/chat/**`, `src/api/server.ts`, `src/chat/**`, `src/config/env.ts`, matching `tests/**`, matching `agent-docs/**`, `README.md`, `ARCHITECTURE.md` | Delete `signChatGrant`/`verifyChatGrant`, remove chat grant headers/payload fields/env contract, tighten docs/tests to ownership-only auth model | Must preserve existing wallet ownership checks and avoid overlapping unrelated notification edits | 2026-03-10 |
| Codex / public-error-map | Centralize stable public error mapping for chat, tools, and context routes | `src/api/auth/**`, `src/api/chat/**`, `src/api/cobuild-ai-context/**`, `src/api/tools/**`, `src/api/server-helpers.ts`, `src/tools/registry.ts`, matching `tests/**`, matching `agent-docs/**` | Add shared public error definitions/builders; replace scattered route/tool error strings and external failure mapping | Preserve current status-code semantics while eliminating raw upstream failure text from public responses | 2026-03-10 |
## Rules

1. Add a row before your first code edit for every coding task (single-agent and multi-agent).
2. Update your row immediately when scope or symbol-change intent changes.
3. Before deleting or renaming a symbol, check this table for dependencies.
4. Delete your row as soon as the task is complete or abandoned.
5. Leave only the header and empty table when there is no active work.
