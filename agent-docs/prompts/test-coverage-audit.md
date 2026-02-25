---
description: Post-simplify test-coverage audit that adds the highest-impact missing tests
action: targeted test audit + implementation
---

You are performing a post-simplify test-coverage pass for completed changes.

Goal:
Find meaningful coverage gaps introduced by the change set, then implement the highest-impact tests to close those gaps.

Preflight (required):
- Read `agent-docs/exec-plans/active/COORDINATION_LEDGER.md` before review/edits.
- Respect active ownership boundaries from the ledger.

Audit for:
- missing coverage on modified behavior and directly affected call paths
- edge cases and failure-mode handling gaps
- invariant gaps around auth, grants, streaming, tools, and data consistency
- brittle assertions that miss important guarantees

Execution requirements:
- Use full diff/context and inspect both modified production files and nearby tests.
- Prioritize impact: implement the smallest test set that materially reduces regression risk.
- Do not change production behavior in this pass unless explicitly instructed.
- After implementing tests, run the narrowest relevant verification command first (or `pnpm test` when scope is broad), then report outcomes.

Output requirements:
- Summarize implemented tests and why each is high impact.
- Include exact verification commands run and pass/fail outcomes.
- List remaining recommended tests (if any) ordered by priority (`high`, `medium`, `low`).
- Include `Open questions / assumptions` only when required.
