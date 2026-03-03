# 2026-03-03 Wire Published Dependency Guard

## Goal

Prevent local `@cobuild/wire` link/file dependency specs from being committed by automatically normalizing to the latest published npm version during pre-commit.

## Scope

- Add a reusable dependency guard script (`scripts/wire-ensure-published.sh`).
- Run the guard from `.husky/pre-commit`.
- Make `scripts/wire-use-published.sh` default to latest npm when no version is provided.
- Expose `wire:ensure-published` in `package.json`.

## Done

- Added `scripts/wire-ensure-published.sh`:
  - reads current `@cobuild/wire` dependency spec from `package.json`.
  - resolves latest published version from npm.
  - rewrites the dependency to `^<latest>` when needed.
  - updates lockfile and stages `package.json` + `pnpm-lock.yaml`.
- Updated `.husky/pre-commit` to run the guard before doc-gardening.
- Updated `scripts/wire-use-published.sh` to support no-arg latest resolution.
- Added `wire:ensure-published` npm script in `package.json`.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
