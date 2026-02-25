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
