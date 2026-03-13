Objective:
Assess incentive compatibility and abuse economics for this API.

Review priorities:
- Ways to extract disproportionate model/tool usage from weak limits.
- Retry/idempotency gaps that can be abused for free repeated work.
- Gaps between billing/usage accounting and actual heavy operations.
- Reward asymmetry where malicious clients can shift operational cost to service owners.
- Abuse windows around grant issuance/refresh and rate-limit resets.


Parallel-agent output:
- Please return your final response as a set of copy/paste-ready prompts for parallel agents rather than as a normal prose review.
- Create one prompt per distinct issue or tightly related issue cluster.
- In each prompt, describe the issue in detail, explain why it matters, point to the relevant files, symbols, or tests, and include your best guess at a concrete fix.
- Make each prompt self-contained and specific enough that we can hand it directly to an agent with minimal extra context.
- If you find no actionable issues, say so explicitly instead of inventing prompts.
