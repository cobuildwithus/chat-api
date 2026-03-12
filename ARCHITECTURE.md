# Architecture

Last updated: 2026-03-12

See `README.md` for setup/deployment and `docs/TOOLS.md` for tool contribution steps. The canonical docs map is `agent-docs/index.md`.

## Repository Layout

```text
src/
  api/        # HTTP transport, auth, schema validation, route handlers
  ai/         # model client, agents, prompts, and tool registry
  chat/       # chat domain state (messages, ids, parsing)
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
- chat routes
- bearer-authenticated CLI routes (`/v1/tools`, `/v1/tools/:name`, `/v1/tool-executions`, `/v1/farcaster/profiles/link-wallet`) guarded by bearer PAT auth
- global error handler
4. Process handlers (`SIGTERM`, `SIGINT`, `uncaughtException`, `unhandledRejection`) close server, DB, and Redis in controlled order.

## Request Pipeline (Common)

1. Route schema validation from route-local schema modules under `src/api/**/schema.ts`.
2. For authenticated routes, auth runs in `preValidation` so `requestContext` is set before `preHandler` rate-limit key generation:
- chat + token routes use `validateChatUser`
- canonical tools routes use `enforceToolsBearerAuth`
- CLI wallet-link sync route uses `enforceWalletExecuteBearerAuth`
- these auth hooks resolve `requestContext.user` / `requestContext.toolsPrincipal`
- Privy JWT mode (`privy-id-token`)
- Self-hosted mode (`x-chat-user`/default address and optional `x-chat-auth` shared secret)
3. Handler logic executes per endpoint.
4. Errors are normalized by `src/api/server-helpers.ts`.

## Endpoint Flows

### POST `/api/chat`

1. Parse request body (`chatId`, `clientMessageId`, `userMessage`, optional attachments/context).
2. Verify chat ownership in DB for the authenticated wallet.
3. Load the default chat agent and acquire generation admission (`src/ai/agents/agent.ts`, `src/ai/ai-rate.limit.ts`).
4. Append the new user turn on the server using DB history as the source of truth.
5. Persist a pending assistant message before streaming.
  - Assistant ids are server-authoritative; route-generated ids are passed as trusted ids to storage for lifecycle consistency.
6. Stream model output via AI SDK (`streamText`) with registered tools.
7. On finish:
- persist finalized assistant/tool messages
- update usage counters asynchronously
8. On stream error:
- mark pending assistant message as failed
- return stream error text

### POST `/api/chat/new`

1. Create chat row in `cobuild.chat` for authenticated user.
2. Return `{ chatId }`.

### GET `/api/chats`

1. Load user-owned chats ordered by recency.
2. Apply bounded `limit`.
3. Return compact chat summaries.

### GET `/api/chat/:chatId`

1. Enforce ownership for requested chat id.
2. Load ordered message history from `cobuild.chat_message`.
3. Map DB rows to UI-message shape.
4. Return chat payload and messages.

### GET `/v1/tools`

1. Verify bearer token authorization (`Authorization: Bearer <bbt_...>`).
2. Return canonical tool metadata catalog from shared registry.

### GET `/v1/tools/:name`

1. Verify bearer token authorization (`Authorization: Bearer <bbt_...>`).
2. Resolve tool metadata by canonical name or alias.
3. Return `404` if tool is unknown.

### POST `/v1/tool-executions`

1. Verify bearer token authorization (`Authorization: Bearer <bbt_...>`).
2. Parse execution request (`name`, optional `input`).
3. Resolve tool auth policy from the canonical registry, enforce any required scopes, and execute the shared tool executor.
4. Return normalized success (`{ ok, name, output }`) or structured error.

### POST `/v1/farcaster/profiles/link-wallet`

1. Verify bearer token authorization (`Authorization: Bearer <bbt_...>`) and require `wallet:execute`.
2. Parse and normalize the wallet-link request (`fid`, `address`) with route-level EVM validation.
3. Authorize the requested address against the authenticated CLI session:
- local signup sync may link the session owner wallet
- hosted/CDP signup sync may link the server-known hosted agent wallet for the session owner + agent key
4. Verify onchain via Farcaster IdRegistry that the authorized wallet currently owns the supplied `fid`.
5. Upsert `farcaster.profiles` so `verified_addresses` preserves existing verified/manual values and `manual_verified_addresses` always includes the linked wallet.
6. Return `{ ok, fid, address }`.

## AI Layer

- Model client: `src/ai/ai.ts` (OpenAI provider with request timeout).
- Agent selection: `src/ai/agents/agent.ts` (currently resolves the single supported `chat-default` runtime).
- Prompt assembly: `src/ai/utils/agent-prompts.ts`.
- Stream preparation: `src/api/chat/chat-helpers.ts`.
- Tool registry: `src/ai/tools/index.ts` and `src/ai/tools/tool.ts`.
- Canonical REST tool execution: `src/tools/registry.ts` (includes Farcaster discussion list/thread/semantic search and guarded reply publishing).
- Wallet notifications domain: `src/domains/notifications/**` (subject-wallet resolution, cursor pagination, unread state, and notification visibility for canonical tools).

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

- Cobuild AI context fetch in `src/infra/cobuild-ai-context.ts`.
- Timeout wrapper in `src/infra/http/timeout.ts`.

## Auth and Authorization Model

- Auth identity is wallet-address based.
- Privy mode validates JWT claims and linked wallet addresses.
- Self-hosted mode can trust shared secret + explicit address header.
- Production self-hosted mode requires `SELF_HOSTED_SHARED_SECRET` plus `SELF_HOSTED_PRODUCTION_ENABLED=1`; misconfigured mode fails fast.
- Chat access is ownership-checked per authenticated wallet.
- Unauthorized/missing chat access returns `404` to reduce enumeration.

## Cross-Cutting Reliability Mechanisms

- Request-level limiter (optional, Fastify).
- Production defaults keep request-level limiter enabled unless explicitly disabled.
- Usage-level limiter (Redis sorted-set windows).
- Pending-message reconciliation on stream success/failure.
- Primary-safe reads for read-after-write in title generation path.
- Proxy-supplied geo headers are ignored unless `CHAT_TRUST_PROXY` is configured.
- Structured shutdown that closes server + infra resources.

## Primary Doc Map

- `agent-docs/references/api-contracts.md`
- `agent-docs/references/runtime-ai-flow.md`
- `agent-docs/references/tool-catalog.md`
- `agent-docs/references/data-infra-map.md`
- `agent-docs/RELIABILITY.md`
- `agent-docs/SECURITY.md`
