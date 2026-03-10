# 2026-03-10 Indexed Goal Budget Tools

## Goal

Expose indexed goal and budget inspect tools in the canonical tool registry using direct DB reads over scaffold tables.

## Scope

- Add scaffold DB schema bindings needed for goal/budget reads.
- Add indexed read helpers for normalized goal/budget inspect responses.
- Register canonical tool metadata and execution paths for the new inspect tools.
- Document the new tool contracts.

## Constraints

- Read directly from the shared database; do not add an indexer GraphQL dependency.
- Keep `chat-api` read/inspect-centric; no protocol write tools in this phase.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

Status: completed
Updated: 2026-03-10
Completed: 2026-03-10
