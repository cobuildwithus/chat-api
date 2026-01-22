# chat-api

Minimal chat service for Cobuild. Exposes only chat endpoints and uses the existing Cobuild Postgres + Redis.

This repo is intentionally small and queue-free: only HTTP + auth + chat storage + AI tools.

## Endpoints

```http
POST /api/chat        # streaming chat
POST /api/chat/new    # create chat
GET  /api/chats       # list chats
GET  /api/chat/:chatId
```

### Auth
- `privy-id-token` header required for all chat endpoints.
- `x-chat-grant` is issued by the API and can be reused for subsequent chat sends.
- Privy docs: https://privy.io

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Request shape (high level)

- `/api/chat/new` creates a chat row and returns `chatId` + `chatGrant`.
- `/api/chat` streams a response and persists chat messages.
- `/api/chat/:chatId` returns stored messages (and refreshes `x-chat-grant`).

See `src/api/chat/schema.ts` for precise request/response schemas.

## Self-hosted mode (no Privy)

Set `SELF_HOSTED_MODE=true` to bypass Privy auth. In this mode you must provide an
EVM address via the `x-chat-user` header or set `SELF_HOSTED_DEFAULT_ADDRESS`.
For a slightly safer setup, set `SELF_HOSTED_SHARED_SECRET` and send it as `x-chat-auth`
on every request.

Minimal setup:

1. Set `SELF_HOSTED_MODE=true` in `.env`.
2. Either:
   - add `x-chat-user: <evm_address>` to each request, or
   - set `SELF_HOSTED_DEFAULT_ADDRESS` once and omit the header.
3. Optional but recommended: set `SELF_HOSTED_SHARED_SECRET` and send it as `x-chat-auth`.

Note: this mode is meant for local/dev or trusted environments. If you expose the service
publicly, you should add your own auth or IP allow‑list.

Example:

```bash
curl -H "x-chat-user: 0xabc0000000000000000000000000000000000000" \
  -H "x-chat-auth: your-secret" \
  -H "content-type: application/json" \
  http://localhost:4000/api/chat/new \
  -d '{"type":"chat-default"}'
```

## Built with

- Fastify (HTTP server)
- Drizzle ORM + Postgres (storage)
- Redis (cache + rate limiting)
- Vercel AI SDK + OpenAI Responses API (LLM runtime)
- Zod (request validation)
- Neynar SDK (optional Farcaster tools)

## Environment

See `.env.example` for required values.

Key variables:
- `COBUILD_POSTGRES_URL`
- `COBUILD_REDIS_URL`
- `OPENAI_API_KEY`
- `PRIVY_APP_ID` (required unless `SELF_HOSTED_MODE=true`)
- `PRIVY_VERIFICATION_KEY` (required in production unless `SELF_HOSTED_MODE=true`)
- `CHAT_GRANT_SECRET`
- `NEYNAR_API_KEY` (optional, for getCast tool)
- `SELF_HOSTED_MODE` (optional, set to `true` to bypass Privy)
- `SELF_HOSTED_DEFAULT_ADDRESS` (optional, fallback address in self-hosted mode)
- `SELF_HOSTED_SHARED_SECRET` (optional, require `x-chat-auth` in self-hosted mode)

Generate a `CHAT_GRANT_SECRET` with:

```bash
openssl rand -hex 32
```

## Database setup (minimal)

Use the provided migration to create the minimal schema (`cobuild` + `farcaster`).

```bash
psql "$COBUILD_POSTGRES_URL" -f migrations/0001_minimal_chat.sql
```

Notes:
- The `farcaster.profiles` table is required for the `getUser` tool and user data prompt.
- If you do not plan to use Farcaster tools, you can still create it empty.
Migration file: [migrations/0001_minimal_chat.sql](https://github.com/cobuildwithus/chat-api/blob/main/migrations/0001_minimal_chat.sql)

## Tests

```bash
pnpm test
pnpm typecheck
```

## Deployment tips

### Railway

Hosted option: https://railway.app

1. Create a new Railway project and link this repo.
2. Add Postgres + Redis plugins (or your own managed services).
3. Set environment variables from `.env.example`:
   - `COBUILD_POSTGRES_URL` = Railway Postgres connection string
   - `COBUILD_REDIS_URL` = Railway Redis connection string
   - `OPENAI_API_KEY`
   - `CHAT_GRANT_SECRET`
   - `PRIVY_APP_ID` / `PRIVY_VERIFICATION_KEY` (unless `SELF_HOSTED_MODE=true`)
4. Build command: `pnpm install && pnpm build`
5. Start command: `pnpm start`

Railway injects `PORT`, and the server binds to `::` by default.

### Generic hosting

- Run `pnpm build` and start with `pnpm start` (or `node dist/index.js`).
- Ensure `PORT` is set if your platform requires a specific port.
- Set `CHAT_ALLOWED_ORIGINS` for browser access.

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) for the module map and request flow.
- [docs/TOOLS.md](docs/TOOLS.md) for adding and registering tools.
- [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.
- [migrations/0001_minimal_chat.sql](migrations/0001_minimal_chat.sql) for minimal database setup.
