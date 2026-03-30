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


Patch-file output:
- Please return your final response as a single `.patch` file attachment with a `.patch` filename rather than as a normal prose review.
- Put all actionable fixes into one unified diff that we can download and apply directly.
- Limit the patch to concrete changes that fit this review scope, and keep the diff self-contained.
- If there are important residual concerns that you did not change, list them briefly outside the patch.
- If you find no actionable issues, say so explicitly instead of inventing a patch.
