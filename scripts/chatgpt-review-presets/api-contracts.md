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


Parallel-agent output:
- Please return your final response as a set of copy/paste-ready prompts for parallel agents rather than as a normal prose review.
- Create one prompt per distinct issue or tightly related issue cluster.
- In each prompt, describe the issue in detail, explain why it matters, point to the relevant files, symbols, or tests, and include your best guess at a concrete fix.
- Make each prompt self-contained and specific enough that we can hand it directly to an agent with minimal extra context.
- If you find no actionable issues, say so explicitly instead of inventing prompts.
