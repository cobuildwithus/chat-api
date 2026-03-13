Objective:
Audit reliability and operational safety for this API in unattended production use.

Focus:
- Idempotency/retry safety for requests that trigger model/tool work.
- Timeout/backoff/cancellation behavior around OpenAI, Redis, and Postgres.
- Race conditions around grants, pending messages, and stream completion/failure paths.
- Deterministic error contracts and stable status-code behavior.
- Cleanup behavior for partial stream failures and interrupted requests.
- Cross-environment assumptions (local/dev/prod auth modes and infra variance).

Output format:
- Findings ordered by severity (`high`, `medium`, `low`).
- For each finding include: `severity`, `file:line`, `issue`, `impact`, `recommended fix`.
- Include a short `Residual risk areas` section even if no findings are present.


Parallel-agent output:
- Please return your final response as a set of copy/paste-ready prompts for parallel agents rather than as a normal prose review.
- Create one prompt per distinct issue or tightly related issue cluster.
- In each prompt, describe the issue in detail, explain why it matters, point to the relevant files, symbols, or tests, and include your best guess at a concrete fix.
- Make each prompt self-contained and specific enough that we can hand it directly to an agent with minimal extra context.
- If you find no actionable issues, say so explicitly instead of inventing prompts.
