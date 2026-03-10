# 2026-03-10 Protocol Address And Helper Surface

## Goal

Replace the local indexed-inspect helper module with the published `@cobuild/wire` helper surface after the upstream package release.

## Scope

- Update indexed-inspect modules to import reusable pure helpers from `@cobuild/wire`.
- Remove the local duplicate helper implementation.
- Bump the published `@cobuild/wire` dependency to the released version.
- Keep indexed inspect runtime behavior unchanged.

## Constraints

- Do not fold runtime-coupled DB/query logic into `wire`.
- Avoid overlapping concurrent chat/auth/notification edits outside the indexed-inspect helper slice.
- Keep public inspect responses stable.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

## Status

completed
