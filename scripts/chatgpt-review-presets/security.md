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


Parallel-agent output:
- Please return your final response as a set of copy/paste-ready prompts for parallel agents rather than as a normal prose review.
- Create one prompt per distinct issue or tightly related issue cluster.
- In each prompt, describe the issue in detail, explain why it matters, point to the relevant files, symbols, or tests, and include your best guess at a concrete fix.
- Make each prompt self-contained and specific enough that we can hand it directly to an agent with minimal extra context.
- If you find no actionable issues, say so explicitly instead of inventing prompts.
