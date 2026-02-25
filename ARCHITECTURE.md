# Architecture

Last updated: 2026-02-25

See `README.md` for setup/deployment and `docs/TOOLS.md` for tool contribution steps. The canonical docs map is `agent-docs/index.md`.

## Repository Layout

```text
src/
  api/        # HTTP transport, auth, schema validation, route handlers
  ai/         # model client, agents, prompts, and tool registry
  chat/       # chat domain state (messages, grants, ids, parsing)
  config/     # env parsing + runtime constants
  infra/      # Postgres, Redis, caching, timeout and external clients
  index.ts    # process startup/shutdown
migrations/   # SQL bootstrap schema
tests/        # behavior tests by domain (api, ai, chat, infra, config)
```

## Composition Root and Lifecycle

1. Startup enters `src/index.ts`.
2. Env is parsed/validated by `src/config/env.ts`.
3. Fastify app is built in `src/api/server.ts`:
- request context
- optional debug request logging
- optional request rate limiting
- CORS
- chat routes + docs search route + `/healthz`
- buildbot tools routes (`/api/buildbot/tools/*`) guarded by internal service header auth
- global error handler
4. Process handlers (`SIGTERM`, `SIGINT`, `uncaughtException`, `unhandledRejection`) close server, DB, and Redis in controlled order.

## Request Pipeline (Common)

1. Route schema validation from route-local schema modules under `src/api/**/schema.ts`.
2. For chat routes, `validateChatUser` pre-handler resolves `requestContext.user`:
- Privy JWT mode (`privy-id-token`)
- Self-hosted mode (`x-chat-user`/default address and optional `x-chat-auth` shared secret)
3. Handler logic executes per endpoint.
4. Errors are normalized by `src/api/server-helpers.ts`.

## Endpoint Flows

### POST `/api/chat`

1. Parse request body (chat id, message history, type, optional context/data).
2. Verify `x-chat-grant` if present.
3. If grant is missing/invalid/mismatched, verify chat ownership in DB.
4. In parallel:
- enforce token-usage rate limit (`src/ai/ai-rate.limit.ts`)
- load agent (`src/ai/agents/agent.ts`)
5. Persist a pending assistant message before streaming.
6. Stream model output via AI SDK (`streamText`) with registered tools.
7. On finish:
- persist finalized messages
- update usage counters asynchronously
- set refreshed `x-chat-grant` when needed
8. On stream error:
- mark pending assistant message as failed
- return stream error text

### POST `/api/chat/new`

1. Create chat row in `cobuild.chat` for authenticated user.
2. Generate scoped chat grant.
3. Return `{ chatId, chatGrant }`.

### GET `/api/chats`

1. Load user-owned chats ordered by recency.
2. Apply bounded `limit`.
3. Optionally filter by valid EVM `goalAddress` from chat metadata.
4. Return compact chat summaries.

### GET `/api/chat/:chatId`

1. Enforce ownership for requested chat id.
2. Load ordered message history from `cobuild.chat_message`.
3. Map DB rows to UI-message shape.
4. Issue refreshed `x-chat-grant`.
5. Return chat payload and messages.

### POST `/api/docs/search`

1. Parse request body (`query`, optional `limit`).
2. Verify docs-search configuration (`DOCS_VECTOR_STORE_ID`, `OPENAI_API_KEY`).
3. Execute OpenAI vector store search request against `DOCS_VECTOR_STORE_ID`.
4. Return normalized docs hits (`query`, `count`, `results`).

### POST `/api/buildbot/tools/get-user`

1. Verify internal service authorization via `x-chat-internal-key`.
2. Enforce route-local buildbot tools rate limit (Redis-backed window counter).
3. Parse username (`fname`) input.
4. Resolve Farcaster profile data with Redis lock-backed cache.
5. Return exact profile match or fuzzy candidates.

### POST `/api/buildbot/tools/get-cast`

1. Verify internal service authorization via `x-chat-internal-key`.
2. Enforce route-local buildbot tools rate limit.
3. Parse cast identifier input (`hash` or `url`).
4. Read from short Redis cache; on miss call Neynar lookup with timeout guard.
5. Return cast payload or not-found/config/upstream error.

### POST `/api/buildbot/tools/cast-preview`

1. Verify internal service authorization via `x-chat-internal-key`.
2. Enforce route-local buildbot tools rate limit.
3. Validate cast preview payload (`text`, optional `embeds`, optional `parent`).
4. Return normalized preview payload (`no-store` response).

### POST `/api/buildbot/tools/cobuild-ai-context`

1. Verify internal service authorization via `x-chat-internal-key`.
2. Enforce route-local buildbot tools rate limit.
3. Return cached Cobuild AI context snapshot from Redis-backed cache.
4. Surface upstream snapshot fetch failures as `502`.

## AI Layer

- Model client: `src/ai/ai.ts` (OpenAI provider with request timeout).
- Agent selection: `src/ai/agents/agent.ts` (currently supports `chat-default`).
- Prompt assembly: `src/ai/utils/agent-prompts.ts`.
- Stream preparation: `src/api/chat/chat-helpers.ts`.
- Tool registry: `src/ai/tools/index.ts` and `src/ai/tools/tool.ts`.

## Data + Infra Layer

### Postgres

- DB bootstrapping in `src/infra/db/create-cobuild-db.ts`.
- Primary + optional read-replica topology.
- Per-connection safety timeouts applied at connect.
- Schema definitions in `src/infra/db/schema.ts`.

### Redis and Caching

- Shared Redis client lifecycle in `src/infra/redis.ts`.
- Distributed lock helper with token-based unlock.
- Usage-rate window tracking in `src/infra/rate-limit.ts`.
- Lock-backed cache helper in `src/infra/cache/cacheResult.ts`.

### External APIs

- Neynar client in `src/infra/neynar/client.ts`.
- Cobuild AI context fetch in `src/infra/cobuild-ai-context.ts`.
- Timeout wrapper in `src/infra/http/timeout.ts`.

## Auth and Authorization Model

- Auth identity is wallet-address based.
- Privy mode validates JWT claims and linked wallet addresses.
- Self-hosted mode can trust shared secret + explicit address header.
- Chat access is ownership-checked and grant-scoped.
- Unauthorized/missing chat access returns `404` to reduce enumeration.

## Cross-Cutting Reliability Mechanisms

- Request-level limiter (optional, Fastify).
- Buildbot-tools route-local limiter (always-on Redis window counter with `Retry-After`).
- Usage-level limiter (Redis sorted-set windows).
- Pending-message reconciliation on stream success/failure.
- Primary-safe reads for read-after-write in title generation path.
- Structured shutdown that closes server + infra resources.

## Primary Doc Map

- `agent-docs/references/api-contracts.md`
- `agent-docs/references/runtime-ai-flow.md`
- `agent-docs/references/tool-catalog.md`
- `agent-docs/references/data-infra-map.md`
- `agent-docs/RELIABILITY.md`
- `agent-docs/SECURITY.md`
