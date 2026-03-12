# Quality Score

Snapshot date: 2026-03-07

| Area | Score (1-5) | Evidence | Priority follow-up |
| --- | --- | --- | --- |
| API route consistency | 4 | Centralized route wiring + shared pre-handler + schema definitions. | Add explicit response schemas for all routes. |
| Auth and grant handling | 3 | Strong ownership checks + signed grants; dual auth modes. | Tighten self-hosted hardening defaults and header redaction. |
| Tool/runtime integration | 3 | Tool registry is explicit and tested. | Normalize error contracts across tools. |
| Storage/caching correctness | 3 | Primary/replica split + cache lock helper exist. | Add more lock-timeout + partial-failure regression coverage. |
| Reliability controls | 3 | Dual rate limiting + pending-message reconciliation + graceful shutdown. | Improve observability around limiter/cache fallback paths. |
| Test posture | 4 | Broad test surface across `api`, `ai`, `chat`, `infra`, `config`, with published-wire verification enforced before CI test lanes run. | Add explicit contract tests for schema/runtime mismatch cases. |
| Agent docs coverage | 5 | Architecture + product + security + verification/CI references are codified and enforced by docs drift. | Keep docs synced in each behavior PR. |

## Top Risks

1. Logging redaction currently covers only a narrow header set.
2. Request schemas currently do not enforce response-shape contracts.
3. Chat-list compatibility parameters remain tolerated longer than the active runtime uses them.
