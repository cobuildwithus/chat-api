Objective:
Find the highest-risk missing tests for this chat API and specify the minimal set that blocks regressions.

Focus:
- Modified/high-risk paths: auth, grants, streaming, tool execution, and infra boundaries.
- Failure modes: timeouts, malformed payloads, permission errors, partial writes, stale grants.
- Contract tests for status codes, response shape, and error invariants.
- Invariants around retries/idempotency, rate limiting, and pending-message reconciliation.
- Secret redaction and sensitive output suppression.

Output format:
- `High impact tests to add now` (max 8), each with:
  `priority`, `target file/suite`, `risk scenario`, `exact assertion/invariant`, `why high impact`.
- `Lower-priority follow-ups` (optional).
- `Open questions / assumptions` only when necessary.


Parallel-agent output:
- Please return your final response as a set of copy/paste-ready prompts for parallel agents rather than as a normal prose review.
- Create one prompt per distinct issue or tightly related issue cluster.
- In each prompt, describe the issue in detail, explain why it matters, point to the relevant files, symbols, or tests, and include your best guess at a concrete fix.
- Make each prompt self-contained and specific enough that we can hand it directly to an agent with minimal extra context.
- If you find no actionable issues, say so explicitly instead of inventing prompts.
