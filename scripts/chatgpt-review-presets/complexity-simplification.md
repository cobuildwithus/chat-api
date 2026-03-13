Objective:
Find behavior-preserving simplifications that reduce complexity, risk, and maintenance cost.

Review priorities:
- Dead code, stale feature toggles, and no-op abstractions.
- Overly nested control flow in request handlers and streaming orchestration.
- Duplicated validation/auth/grant logic that should be centralized.
- State that can be derived instead of persisted or threaded through layers.
- Redundant wrappers around DB/Redis/client calls.
- Naming and type clarity improvements that reduce misuse risk.


Parallel-agent output:
- Please return your final response as a set of copy/paste-ready prompts for parallel agents rather than as a normal prose review.
- Create one prompt per distinct issue or tightly related issue cluster.
- In each prompt, describe the issue in detail, explain why it matters, point to the relevant files, symbols, or tests, and include your best guess at a concrete fix.
- Make each prompt self-contained and specific enough that we can hand it directly to an agent with minimal extra context.
- If you find no actionable issues, say so explicitly instead of inventing prompts.
