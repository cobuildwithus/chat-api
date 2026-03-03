# Data + Infra Map Reference

## Postgres Topology

- DB bootstrap: `src/infra/db/create-cobuild-db.ts`.
- Uses primary connection plus optional read replicas.
- Replica connections are configured read-only.
- Connection-level safety timeouts are applied on connect.

## Core Tables Used By Chat API

- `cobuild.chat`
- `cobuild.chat_message`
- `farcaster.profiles`
- `farcaster.casts` (discussion listing/thread reads + semantic search)

Semantic search invariant:
- `farcaster.casts.text_embedding` must be `vector(256)` to match OpenAI embedding dimensions.

Schema source: `src/infra/db/schema.ts` and `migrations/0001_canonical_schema.sql`.

## Redis Roles

- Shared client lifecycle: `src/infra/redis.ts`.
- Distributed lock utility for cache stampede mitigation.
- Token-usage windows for usage limiter (`src/infra/rate-limit.ts`).

## Cache Model

- Generic cache helper: `src/infra/cache/cacheResult.ts`.
- Pattern: get -> lock -> compute -> set -> unlock.
- Lock timeout path falls back to compute without cache lock.
- Cache is disabled in development mode to reduce local stale behavior.

## Timeout and HTTP Controls

- Timeout helpers: `src/infra/http/timeout.ts`.
- OpenAI model fetch is timeout-wrapped.
- Cobuild-context fetches are timeout-bound with dedicated env defaults.

## Startup and Shutdown Semantics

- Startup: env parse -> server setup -> listen (`src/index.ts`).
- Shutdown: close server first, then close DB + Redis.
- Fatal handlers trigger non-zero exit for uncaught exceptions/rejections.

## Operational Invariants

1. Ownership checks must gate all chat-id scoped reads/writes.
2. Grant refresh should remain aligned with read/write chat continuation paths.
3. Pending message lifecycle should always end in success or failed terminal state.
