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
