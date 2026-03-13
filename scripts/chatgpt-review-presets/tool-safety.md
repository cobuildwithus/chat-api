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


Parallel-agent output:
- Please return your final response as a set of copy/paste-ready prompts for parallel agents rather than as a normal prose review.
- Create one prompt per distinct issue or tightly related issue cluster.
- In each prompt, describe the issue in detail, explain why it matters, point to the relevant files, symbols, or tests, and include your best guess at a concrete fix.
- Make each prompt self-contained and specific enough that we can hand it directly to an agent with minimal extra context.
- If you find no actionable issues, say so explicitly instead of inventing prompts.
