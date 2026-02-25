# Quality Score

Snapshot date: 2026-02-18

| Area | Score (1-5) | Evidence | Priority follow-up |
| --- | --- | --- | --- |
| API route consistency | 4 | Centralized route wiring + shared pre-handler + schema definitions. | Add explicit response schemas for all routes. |
| Auth and grant handling | 3 | Strong ownership checks + signed grants; dual auth modes. | Tighten self-hosted hardening defaults and header redaction. |
| Tool/runtime integration | 3 | Tool registry is explicit and tested. | Normalize error contracts across tools. |
| Storage/caching correctness | 3 | Primary/replica split + cache lock helper exist. | Add more lock-timeout + partial-failure regression coverage. |
| Reliability controls | 3 | Dual rate limiting + pending-message reconciliation + graceful shutdown. | Improve observability around limiter/cache fallback paths. |
| Test posture | 4 | Broad test surface across `api`, `ai`, `chat`, `infra`, `config`. | Add explicit contract tests for schema/runtime mismatch cases. |
| Agent docs coverage | 5 | Architecture + product + security + deep references are now codified. | Keep docs synced in each behavior PR. |

## Top Risks

1. Request schema vs runtime support drift (`type` accepted broadly, runtime supports only `chat-default`).
2. Logging redaction currently covers only a narrow header set.
3. Request schemas currently do not enforce response-shape contracts.
