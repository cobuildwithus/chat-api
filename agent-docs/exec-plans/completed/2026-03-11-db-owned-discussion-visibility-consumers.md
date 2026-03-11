# 2026-03-11 DB-Owned Discussion Visibility Consumers

## Goal

Replace repo-local discussion visibility filters in wallet notifications and Farcaster discussion tools with the new DB-owned helper surface.

## Scope

- Update `src/domains/notifications/service.ts` to call the DB-owned notification visibility helper.
- Update `src/tools/registry/farcaster.ts` discussion list/thread/search queries to read from DB-owned visible discussion helpers instead of restating channel/hidden/score filters.
- Add or update regression coverage for both call paths.

## Constraints

- Preserve existing tool contracts, pagination behavior, and notification cursor semantics.
- Keep `@cobuild/wire` notification presentation authoritative.
- Match the current discussion tool semantics by using the text-cast visibility helper for list/thread/search queries.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
Status: completed
Updated: 2026-03-11
Completed: 2026-03-11
