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


Patch-file output:
- Please return your final response as a single `.patch` file attachment with a `.patch` filename rather than as a normal prose review.
- Put all actionable fixes into one unified diff that we can download and apply directly.
- Limit the patch to concrete changes that fit this review scope, and keep the diff self-contained.
- If there are important residual concerns that you did not change, list them briefly outside the patch.
- If you find no actionable issues, say so explicitly instead of inventing a patch.
