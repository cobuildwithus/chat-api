Objective:
Audit authentication, authorization, and grant-token lifecycle safety.

Focus:
- JWT verification mode correctness and claim usage.
- Self-hosted mode hardening and safe-default posture.
- Grant issuance, refresh, expiry, and chat/user scope enforcement.
- Ownership checks on all chat read/write paths.
- Replay/confusion risks across users/chats/environments.

Output format:
- Findings ordered by severity (`high`, `medium`, `low`).
- For each finding include: `severity`, `file:line`, `issue`, `impact`, `recommended fix`.


Patch-file output:
- Please return your final response as a single `.patch` file attachment with a `.patch` filename rather than as a normal prose review.
- Put all actionable fixes into one unified diff that we can download and apply directly.
- Limit the patch to concrete changes that fit this review scope, and keep the diff self-contained.
- If there are important residual concerns that you did not change, list them briefly outside the patch.
- If you find no actionable issues, say so explicitly instead of inventing a patch.
