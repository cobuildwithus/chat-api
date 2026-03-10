# Refactor indexed protocol inspect internals

Status: completed
Created: 2026-03-10
Updated: 2026-03-10

## Goal

- Split `src/domains/protocol/indexed-inspect.ts` into focused internal modules for identifier helpers, deterministic resolvers, batched indexed reads, and response mappers without changing the public inspect API.

## Success criteria

- Public exports remain `inspectGoal`, `inspectBudget`, `inspectTcrRequest`, `inspectDispute`, `inspectStakePosition`, and `inspectPremiumEscrow`.
- Indexed inspect behavior stays read-only and DB-first.
- Inline per-call select composition is reduced by moving common reads and mapping logic into reusable helpers.
- Existing protocol inspect tests continue to pass.

## Scope

- In scope:
- `src/domains/protocol/indexed-inspect.ts`
- new internal modules under `src/domains/protocol/indexed-inspect/**`
- `tests/domains/protocol/indexed-inspect.spec.ts` only if import paths or expectations need adjustment
- this execution plan and coordination ledger
- Out of scope:
- tool registry contract changes
- protocol write behavior
- unrelated active protocol/notification work

## Constraints

- Keep the indexed-DB-first design.
- Do not introduce GraphQL, RPC, or event replay reads.
- Preserve current normalized identifier semantics and response shapes unless a targeted bug fix is required by the refactor.
- Run simplify, test-coverage-audit, and task-finish-review audit passes before handoff.

## Risks and mitigations

1. Risk: Refactoring query flow changes lookup precedence or nullability semantics.
   Mitigation: Preserve resolver order, keep focused helper names, and rely on the existing behavior tests.
2. Risk: Breaking mocked DB call sequencing in tests.
   Mitigation: Keep fetch batching deterministic and verify against the current spec before widening changes.

## Tasks

1. Extract identifier/state/timestamp helpers into a dedicated module.
2. Extract deterministic lookup resolvers and shared indexed row fetch helpers.
3. Extract response mappers and keep `indexed-inspect.ts` as a thin orchestration entrypoint.
4. Run required verification and completion-workflow audits, then close out.

## Decisions

- Use an internal `indexed-inspect/` subdirectory with a public wrapper file at the existing path to avoid downstream import churn.

## Verification

- Commands to run:
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
- Expected outcomes:
- Protocol inspect behavior remains stable while the internal module boundaries become explicit.
Completed: 2026-03-10
