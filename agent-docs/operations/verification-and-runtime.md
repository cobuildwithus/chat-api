# Verification and Runtime

Last verified: 2026-02-25

## Verification Commands

- Required checks bundle: `pnpm verify`
- Required checks alias: `pnpm verify:required`
- Full verification alias: `pnpm verify:full`
- Individual checks:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:coverage`
  - `bash scripts/check-agent-docs-drift.sh`
  - `bash scripts/doc-gardening.sh --fail-on-issues`

## Required Checks Matrix

| Change scope | Required action | Notes |
| --- | --- | --- |
| Docs-only (`*.md`, `agent-docs/**`) | Run all required checks | `chat-api` policy keeps docs/process updates under the same check gate. |
| Non-doc changes (production code or tests) | Run all required checks | Also run completion workflow audit passes (`simplify` -> `test-coverage-audit` -> `task-finish-review`). |
| User explicitly says to skip checks for the turn | Skip checks | User instruction takes precedence for that turn. |

## Runtime Guardrails

- `pnpm test:coverage` is typically the longest-running required step; prefer finishing implementation before executing the full required gate.
- During multi-agent sessions, avoid running duplicate full verification jobs concurrently in the same repo unless coordination requires it.
- If a check fails, fix the issue and rerun the relevant check set before handoff.

## Coordination Reminder

- Keep `agent-docs/exec-plans/active/COORDINATION_LEDGER.md` current for every coding task.
- For multi-file or high-risk work, add an execution plan under `agent-docs/exec-plans/active/`.
