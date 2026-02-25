Objective:
Assess incentive compatibility and abuse economics for this API.

Review priorities:
- Ways to extract disproportionate model/tool usage from weak limits.
- Retry/idempotency gaps that can be abused for free repeated work.
- Gaps between billing/usage accounting and actual heavy operations.
- Reward asymmetry where malicious clients can shift operational cost to service owners.
- Abuse windows around grant issuance/refresh and rate-limit resets.
