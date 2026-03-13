Objective:
Find concrete bad-code patterns and anti-patterns that hurt correctness, readability, and maintainability in this chat API.

Review priorities:
- Inconsistent request/response assumptions between schema and runtime handlers.
- Over-complicated route or tool branching that can be simplified.
- Error-prone timeout/retry logic and hidden fallback behavior.
- Weak validation for headers, auth claims, and tool arguments.
- Hidden coupling across `src/api`, `src/ai`, and `src/infra` boundaries.
- Ambiguous naming that obscures ownership, trust, or data-flow assumptions.
- Magic values (timeouts, limits, status strings) without clear invariants.
- Logging/error handling that can leak sensitive request context.
- Test-smell indicators (fragile fixtures, low-signal assertions, missing failure-path tests).


Parallel-agent output:
- Please return your final response as a set of copy/paste-ready prompts for parallel agents rather than as a normal prose review.
- Create one prompt per distinct issue or tightly related issue cluster.
- In each prompt, describe the issue in detail, explain why it matters, point to the relevant files, symbols, or tests, and include your best guess at a concrete fix.
- Make each prompt self-contained and specific enough that we can hand it directly to an agent with minimal extra context.
- If you find no actionable issues, say so explicitly instead of inventing prompts.
