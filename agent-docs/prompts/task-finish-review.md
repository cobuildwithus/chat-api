---
description: Final completion audit for regressions, correctness, and security
action: thorough review
---

You are performing a final audit of completed changes. Use full diff/context and inspect all modified files plus directly affected call paths.

Preflight (required):
- Read `agent-docs/exec-plans/active/COORDINATION_LEDGER.md` before review.
- Respect active ownership boundaries from the ledger.

Review for:
- functional and behavioral regressions
- edge cases and failure-mode handling
- incorrect assumptions and invariant breaks
- security and correctness risks
- unexpected interface or state-transition changes
- test gaps for newly introduced risk

Output requirements:
- Return findings ordered by severity (`high`, `medium`, `low`).
- For each finding include: `severity`, `file:line`, `issue`, `impact`, `recommended fix`.
- Include `Open questions / assumptions` when uncertainty remains.
- If no findings exist, state that explicitly and list residual risk areas.
