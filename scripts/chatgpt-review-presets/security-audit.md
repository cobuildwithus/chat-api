Objective:
Perform a focused security audit of the attached chat-api snapshot.

Review priorities:
- Authorization and privilege boundaries (JWT validation, self-hosted mode, grant scope).
- Chat ownership correctness across read/write endpoints.
- Secrets and sensitive data handling in logs, errors, and tool outputs.
- External call hardening (timeouts, retries, trust assumptions, payload validation).
- Input validation and schema/runtime mismatch risks.
- Redis/Postgres interaction safety (locks, race windows, consistency assumptions).


Patch-file output:
- Please return your final response as a single `.patch` file attachment with a `.patch` filename rather than as a normal prose review.
- Put all actionable fixes into one unified diff that we can download and apply directly.
- Limit the patch to concrete changes that fit this review scope, and keep the diff self-contained.
- If there are important residual concerns that you did not change, list them briefly outside the patch.
- If you find no actionable issues, say so explicitly instead of inventing a patch.
