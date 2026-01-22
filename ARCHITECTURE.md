# Architecture

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

## Tools

Tools are registered in `src/ai/tools/index.ts` and assembled by agents.
See `docs/TOOLS.md` for the tool template and contribution steps.

## Data

- Postgres schema lives in `src/infra/db/schema.ts` (cobuild + farcaster schemas).
- Redis client lives in `src/infra/redis.ts`.
