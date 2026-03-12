# 2026-03-10 Route Zod Parsers

## Goal
Replace duplicated Fastify JSON schema objects plus handler-side request casts with shared Zod runtime parsers that also generate the Fastify route schemas.

## Scope
- `src/api/chat/**`
- `src/api/tools/**`
- `src/api/oauth/**`
- shared route parser/schema helper(s) under `src/api/**`
- matching `tests/api/**`
- matching `agent-docs/**`

## Risks and Guards
- Preserve existing endpoint wire contracts while moving request validation to shared parser definitions.
- Keep Fastify route schemas generated from the same Zod source used by handler parsing so runtime and contract cannot drift.
- Avoid touching unrelated in-flight notification work and do not overwrite concurrent edits outside the scoped route files.

## Verification
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

## Status
Implementation completed. Focused route/parser tests passed; repo-wide required checks remain blocked by unrelated existing failures elsewhere in the dirty tree.
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
