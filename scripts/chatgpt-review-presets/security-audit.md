Objective:
Perform a focused security audit of the attached chat-api snapshot.

Review priorities:
- Authorization and privilege boundaries (JWT validation, self-hosted mode, grant scope).
- Chat ownership correctness across read/write endpoints.
- Secrets and sensitive data handling in logs, errors, and tool outputs.
- External call hardening (timeouts, retries, trust assumptions, payload validation).
- Input validation and schema/runtime mismatch risks.
- Redis/Postgres interaction safety (locks, race windows, consistency assumptions).
