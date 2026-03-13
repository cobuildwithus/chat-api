Objective:
Perform a focused security audit of the attached chat-api snapshot.

Review priorities:
- Authorization and privilege boundaries (JWT validation, self-hosted mode, grant scope).
- Chat ownership correctness across read/write endpoints.
- Secrets and sensitive data handling in logs, errors, and tool outputs.
- External call hardening (timeouts, retries, trust assumptions, payload validation).
- Input validation and schema/runtime mismatch risks.
- Redis/Postgres interaction safety (locks, race windows, consistency assumptions).


Parallel-agent output:
- Please return your final response as a set of copy/paste-ready prompts for parallel agents rather than as a normal prose review.
- Create one prompt per distinct issue or tightly related issue cluster.
- In each prompt, describe the issue in detail, explain why it matters, point to the relevant files, symbols, or tests, and include your best guess at a concrete fix.
- Make each prompt self-contained and specific enough that we can hand it directly to an agent with minimal extra context.
- If you find no actionable issues, say so explicitly instead of inventing prompts.
