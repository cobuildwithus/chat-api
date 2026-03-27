---
description: Post-simplify test-coverage audit that adds the highest-impact missing tests
action: targeted test audit + implementation
---

You are performing a post-simplify test-coverage pass for completed changes.

Runtime expectation:
- This audit may take 5 to 10 minutes on a non-trivial diff.
- Work methodically instead of rushing to a shallow answer.
- Parent agent: allow the run to continue and do not cancel it early unless there is clear evidence the audit is stuck or off scope.

Goal:
Find meaningful coverage gaps introduced by the change set, then implement the highest-impact tests to close those gaps.

Preflight (required):
- Read `agent-docs/exec-plans/active/COORDINATION_LEDGER.md` before review/edits.
- Honor any explicit exclusive/refactor notes from the ledger; otherwise work carefully on top of active rows without reverting adjacent edits.

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


Parallel-agent output:
- Please return your final response as a set of copy/paste-ready prompts for parallel agents rather than as a normal prose review.
- Create one prompt per distinct issue or tightly related issue cluster.
- In each prompt, describe the issue in detail, explain why it matters, point to the relevant files, symbols, or tests, and include your best guess at a concrete fix.
- Make each prompt self-contained and specific enough that we can hand it directly to an agent with minimal extra context.
- If you find no actionable issues, say so explicitly instead of inventing prompts.
