Objective:
Audit tool invocation and external integration safety.

Focus:
- Tool input validation and guardrails for high-cost operations.
- Timeouts and bounded error behavior for external APIs.
- Prompt/tool contract mismatches and unsafe fallbacks.
- Side-effect isolation and deterministic failure handling.
- Data-leak risks from tool output shaping.

Output format:
- Findings ordered by severity (`high`, `medium`, `low`).
- For each finding include: `severity`, `file:line`, `issue`, `impact`, `recommended fix`.
