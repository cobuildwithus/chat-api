Objective:
Audit API contract correctness and compatibility for chat-api endpoints.

Focus:
- Schema/runtime parity for request validation and response shapes.
- Backward compatibility of existing endpoint behavior and field semantics.
- Header contracts (`privy-id-token`, `x-chat-grant`, self-hosted headers).
- Error envelope consistency and status code semantics.
- Streaming protocol behavior and terminal-state guarantees.

Output format:
- Findings ordered by severity (`high`, `medium`, `low`).
- For each finding include: `severity`, `file:line`, `contract risk`, `client impact`, `recommended fix`.
