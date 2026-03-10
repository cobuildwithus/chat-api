# Reliability

## Core Invariants

1. Chat ownership is verified before read or write for protected routes.
2. Streaming writes always begin with a pending assistant message and end with either:
- persisted final messages, or
- explicit failed status on error.
3. Read-after-write sensitive reads should use primary-safe DB access paths.

## Request Reliability Model

- Transport-level controls:
- Fastify rate limiting (enabled by default in production; env-configurable)
- Request timeout/keepalive settings at server bootstrap
- Workload-level controls:
- Token-usage rate limiter per address over Redis sorted-set window
- Atomic quota reservation before model work begins, with the reserved quota retained once generation has started even if the client disconnects or final persistence fails
- Route-local docs-search limiter and cli-tools limiter (Redis-backed)

## Timeout Matrix

- `OPENAI_REQUEST_TIMEOUT_MS` default: `30000`
- `COBUILD_AI_CONTEXT_TIMEOUT_MS` default: `7000`

## Cache + Lock Behavior

- Cache helper uses Redis get-or-set with lock to prevent stampedes.
- Development mode bypasses cache to avoid stale local behavior.
- Lock acquisition timeout falls back to direct compute path.
- Lock release is token-based to prevent accidental unlock races.

## Failure Handling Patterns

- Missing/inaccessible chat: return `404` after ownership lookup.
- Stream failure: pending assistant record is marked failed.
- Message-store treats non-user ids as server-authoritative, with explicit trusted-id allowlisting for server-generated pending/stream ids.
- Optional external dependency failure:
- docs tool disabled when vector store id is absent
- docs-search route uses timeout-bounded OpenAI fetch to avoid hung upstream calls
- get-cast returns structured error/null rather than throwing to user path
- cobuild context tool returns bounded error payload

## Known Reliability Gaps

1. Route schemas do not define `response` contracts, so response-shape regressions are easier to introduce.
2. Usage recording is non-blocking and can undercount during transient Redis failures.

## Verification Baseline

- `pnpm run typecheck`
- `pnpm run test`
- `bash scripts/check-agent-docs-drift.sh`

## High-Value Regression Suites

- `tests/api/chat/route.spec.ts`
- `tests/chat/message-store.spec.ts`
- `tests/infra/cache-result.spec.ts`
- `tests/infra/redis.spec.ts`
- `tests/infra/http/timeout.spec.ts`
