# 2026-03-05 Repo Tools 0.1.4 Rollout

Status: completed
Created: 2026-03-05
Updated: 2026-03-05

## Goal

- Switch chat-api from the local `@cobuild/repo-tools` file dependency to the published `^0.1.4` package without changing runtime behavior.

## Success criteria

- `package.json` points to `@cobuild/repo-tools@^0.1.4`.
- `pnpm-lock.yaml` resolves the published `0.1.4` package instead of the local directory dependency.
- Required verification commands from `AGENTS.md` all pass.

## Scope

- In scope: `package.json`, `pnpm-lock.yaml`, and required execution-plan bookkeeping.
- Out of scope: production source, test logic, or script behavior changes.

## Constraints

- Technical constraints: keep runtime behavior unchanged and avoid touching non-dependency code.
- Product/process constraints: respect the coordination ledger hard gate and remove the active entry after completion.

## Risks and mitigations

1. Risk: published package resolution could change local tooling behavior.
   Mitigation: run the full required verification set after the lockfile refresh.

## Tasks

1. Replace the `file:../repo-tools` devDependency with `^0.1.4`.
2. Refresh `pnpm-lock.yaml` against the published package.
3. Run required checks and close the temporary coordination artifacts.

## Decisions

- Use the published `@cobuild/repo-tools@^0.1.4` package as the sole devDependency source of truth for chat-api.

## Verification

- Commands run:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:coverage`
  - `bash scripts/check-agent-docs-drift.sh`
  - `bash scripts/doc-gardening.sh --fail-on-issues`
- Expected outcomes:
  - All required checks pass with only the dependency metadata updated.

Completed: 2026-03-05
