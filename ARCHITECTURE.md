# Architecture

See [README.md](README.md) for setup/deployment, and [docs/TOOLS.md](docs/TOOLS.md) for tool contribution steps.

## High-level layout

```
src/
  api/        # HTTP handlers + auth + server wiring
  ai/         # agents, prompts, tools, model wiring
  chat/       # chat domain logic (storage, grants, helpers)
  config/     # env + constants
  infra/      # db, redis, external clients, caching
  index.ts    # entrypoint
```

## Request flow (POST /api/chat)

1. `api/server.ts` wires routes and middleware.
2. `api/auth/validate-chat-user.ts` validates Privy token and stores user in request context.
3. `api/chat/route.ts` handles chat:
   - loads agent (`ai/agents/...`)
   - rate limits via `ai/ai-rate.limit.ts`
   - streams response and persists via `chat/message-store.ts`

## Request flow (GET /api/chat/:chatId)

1. `api/auth/validate-chat-user.ts` verifies the user.
2. `api/chat/get.ts` loads chat + messages from Postgres.
3. `chat/grant.ts` issues a refreshed `x-chat-grant`.

## Tools

Tools are registered in `src/ai/tools/index.ts` and assembled by agents.
See `docs/TOOLS.md` for the tool template and contribution steps.

## Data

- Postgres schema lives in `src/infra/db/schema.ts` (cobuild + farcaster schemas).
- Redis client lives in `src/infra/redis.ts`.

## Auth + grants

- Auth uses Privy (`privy-id-token`) to resolve the user address.
- `x-chat-grant` is a short-lived signed grant to reauthorize future chat posts without re-querying.

## Self-hosted mode

Set `SELF_HOSTED_MODE=true` to bypass Privy. Requests must include `x-chat-user`
or `SELF_HOSTED_DEFAULT_ADDRESS` must be configured as a fallback. For a slightly
safer setup, set `SELF_HOSTED_SHARED_SECRET` and send `x-chat-auth`.

## Where to look first

- Endpoint handlers: `src/api/chat/*`
- Agent selection + prompts: `src/ai/agents/*`, `src/ai/prompts/*`
- Chat storage rules: `src/chat/message-store.ts`
