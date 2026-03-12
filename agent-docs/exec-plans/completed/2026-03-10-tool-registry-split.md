# Tool Registry Split

## Goal

Refactor `src/tools/registry.ts` into a thin registry manifest backed by domain-specific tool definition/executor modules, without changing the canonical REST registry API or tool behavior.

## Constraints

- Build on top of current in-flight `public-error-map` and `ai-wrapper-schema-alignment` changes.
- Preserve tool names, aliases, auth policy, cache-control behavior, and existing status-code semantics.
- Keep `src/api/tools/registry.ts` as a stable re-export surface.

## Planned Shape

- Move shared registry types/helpers/auth resolution into dedicated `src/tools/**` support modules.
- Group tool definitions/executors by domain:
  - Farcaster/discussions
  - Wallet/notifications
  - Protocol indexed inspect
  - Docs/context
- Leave `src/tools/registry.ts` responsible only for assembling definitions, lookup maps, metadata, and execution orchestration.

## Risks

- Existing tests assert exact validation and execution error strings.
- Other active work also touches `src/tools/registry.ts`, so patches must apply on top without reverting unrelated edits.

## Verification

- Required checks: `pnpm typecheck`, `pnpm test`, `pnpm test:coverage`, `bash scripts/check-agent-docs-drift.sh`, `bash scripts/doc-gardening.sh --fail-on-issues`
- Completion workflow: `simplify` -> `test-coverage-audit` -> `task-finish-review`
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
