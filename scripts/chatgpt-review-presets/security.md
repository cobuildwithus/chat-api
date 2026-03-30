Objective:
Perform a focused security review of a Node.js TypeScript API service used by external clients.

Focus:
- Command/path injection and unsafe subprocess/file access patterns.
- Path traversal and unsafe filesystem reads/writes/deletes.
- Secret handling in logs, stack traces, process args, and temp files.
- Trust boundaries for headers, JWT claims, grants, and remote payloads.
- Approval/auth bypass vectors and unsafe defaults.
- Network hardening: timeout policy, host assumptions, TLS/auth header handling.
- Failure-path behavior that could leak internals or execute partial side effects.

Output format:
- Findings ordered by severity (`high`, `medium`, `low`).
- For each finding include: `severity`, `file:line`, `issue`, `impact`, `recommended fix`.
- Include `Open questions / assumptions` only when required for correctness.


Patch-file output:
- Please return your final response as a single `.patch` file attachment with a `.patch` filename rather than as a normal prose review.
- Put all actionable fixes into one unified diff that we can download and apply directly.
- Limit the patch to concrete changes that fit this review scope, and keep the diff self-contained.
- If there are important residual concerns that you did not change, list them briefly outside the patch.
- If you find no actionable issues, say so explicitly instead of inventing a patch.
