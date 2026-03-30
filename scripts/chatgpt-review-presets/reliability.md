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


Patch-file output:
- Please return your final response as a single `.patch` file attachment with a `.patch` filename rather than as a normal prose review.
- Put all actionable fixes into one unified diff that we can download and apply directly.
- Limit the patch to concrete changes that fit this review scope, and keep the diff self-contained.
- If there are important residual concerns that you did not change, list them briefly outside the patch.
- If you find no actionable issues, say so explicitly instead of inventing a patch.
