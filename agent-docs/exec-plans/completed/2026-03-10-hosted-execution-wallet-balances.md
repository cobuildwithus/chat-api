# Hosted Execution Wallet Balances

## Goal

Ensure `get-wallet-balances` only reports balances for the actual hosted execution wallet used by CLI execution flows, not any legacy owner-wallet row.

## Success Criteria

- Legacy `cli_agent_wallets` rows no longer pass wallet-balance resolution.
- The tool keeps its existing response shape while clarifying hosted execution wallet semantics.
- Regression tests cover the legacy-row guard and current happy path.

## Scope

- `src/tools/registry/wallet.ts`
- wallet-balance tests
- wallet tool docs/catalog wording

## Out Of Scope

- New tool names or AI-wrapper exposure changes.
- Interface execution-route behavior changes.

## Risks / Constraints

- Do not overwrite unrelated dirty edits already present in `docs/TOOLS.md`.
- Keep CLI/tool contracts stable unless a narrower wording change is sufficient.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

Status: completed
Updated: 2026-03-10
Completed: 2026-03-10
