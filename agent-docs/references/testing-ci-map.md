# Testing and CI Map

## Local Verification Baseline

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

## Script Enforcement

- Drift checks: `scripts/check-agent-docs-drift.sh`
- Docs inventory/report generation: `scripts/doc-gardening.sh`
- Plan lifecycle: `scripts/open-exec-plan.sh`, `scripts/close-exec-plan.sh`
- Selective commits: `scripts/committer`
- Oracle review + packaged audit context: `pnpm review:gpt`

## CI Posture

- Main CI: `.github/workflows/test-and-coverage.yml`
- Coverage artifact: `.github/workflows/coverage.yml`
- Documentation maintenance: `.github/workflows/doc-gardening.yml`
- Static security scan: `.github/workflows/codeql.yml`

CI gates enforce docs/process checks plus TypeScript verification:

- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`

## Update Rule

If verification commands, scripts, or workflow files change, update this document and `agent-docs/index.md` in the same change set.
