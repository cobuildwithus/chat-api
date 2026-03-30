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


Patch-file output:
- Please return your final response as a single `.patch` file attachment with a `.patch` filename rather than as a normal prose review.
- Put all actionable fixes into one unified diff that we can download and apply directly.
- Limit the patch to concrete changes that fit this review scope, and keep the diff self-contained.
- If there are important residual concerns that you did not change, list them briefly outside the patch.
- If you find no actionable issues, say so explicitly instead of inventing a patch.
