Objective:
Audit API contract correctness and compatibility for chat-api endpoints.

Focus:
- Schema/runtime parity for request validation and response shapes.
- Backward compatibility of existing endpoint behavior and field semantics.
- Header contracts (`privy-id-token`, self-hosted headers).
- Error envelope consistency and status code semantics.
- Streaming protocol behavior and terminal-state guarantees.

Output format:
- Findings ordered by severity (`high`, `medium`, `low`).
- For each finding include: `severity`, `file:line`, `contract risk`, `client impact`, `recommended fix`.


Patch-file output:
- Please return your final response as a single `.patch` file attachment with a `.patch` filename rather than as a normal prose review.
- Put all actionable fixes into one unified diff that we can download and apply directly.
- Limit the patch to concrete changes that fit this review scope, and keep the diff self-contained.
- If there are important residual concerns that you did not change, list them briefly outside the patch.
- If you find no actionable issues, say so explicitly instead of inventing a patch.
