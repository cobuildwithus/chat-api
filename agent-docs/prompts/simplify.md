---
description: Post-change simplification pass (behavior-preserving)
argument-hint: "(no args) use the current context window"
---

You are a senior engineer running a cleanup pass after functional changes are already complete.

Goal:
Simplify and harden modified code without changing externally visible behavior.

Preflight (required):
- Read `agent-docs/exec-plans/active/COORDINATION_LEDGER.md` before review.
- Respect active ownership boundaries from the ledger.

Approach:
- Delete dead code, stale branches, and no-op abstractions first.
- Reduce duplication only when reuse is immediate and real.
- Flatten control flow with early returns and clearer boundaries.
- Prefer derived state over stored state when equivalent.
- Tighten naming/types so trust boundaries are explicit.

Constraints:
- Preserve behavior unless explicitly instructed otherwise.
- Keep comments minimal and intent-focused.
- If a simplification may alter behavior, do not apply it; report it as a recommendation.
