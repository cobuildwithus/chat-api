# 2026-03-03 Canonical Migration Consolidation

## Goal
Collapse historical incremental SQL migrations into one canonical baseline migration that matches the current schema.

## Scope
- `migrations/0001_minimal_chat.sql` (delete)
- `migrations/0002_cli_cli_token_indexes.sql` (delete)
- `migrations/0003_cli_cli_tokens_table.sql` (delete)
- `migrations/0004_cli_cli_tokens_write_scope.sql` (delete)
- `migrations/0005_cli_cli_tokens_expiry.sql` (delete)
- `migrations/0006_cli_oauth_sessions.sql` (delete)
- `migrations/0001_canonical_schema.sql` (add)
- `README.md`
- `agent-docs/references/data-infra-map.md`
- `agent-docs/index.md`

## Risks and Guards
- Risk: bootstrap breakage from missing schema objects after migration consolidation.
- Guard: preserve all currently required tables/indexes in canonical migration and run full required verification checks.

## Verification
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

## Status
Completed implementation and verification.
