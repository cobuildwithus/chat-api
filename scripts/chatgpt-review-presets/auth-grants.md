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
