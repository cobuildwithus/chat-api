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
- Privy docs: https://privy.io

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Request shape (high level)

- `/api/chat/new` creates a chat row and returns `chatId`.
- `/api/chat` accepts a single user turn (`chatId`, `clientMessageId`, `userMessage`, optional attachments/context), appends it on the server, and streams a response.
- `/api/chat/:chatId` returns stored messages.

See `src/api/chat/schema.ts` for precise request/response schemas.

## Self-hosted mode (no Privy)

Set `SELF_HOSTED_MODE=true` to bypass Privy auth. In this mode you must provide an
EVM address via the `x-chat-user` header or set `SELF_HOSTED_DEFAULT_ADDRESS`.
For a slightly safer setup, set `SELF_HOSTED_SHARED_SECRET` and send it as `x-chat-auth`
on every request.

Production guardrail: self-hosted mode now requires both `SELF_HOSTED_SHARED_SECRET` and
an explicit `SELF_HOSTED_PRODUCTION_ENABLED=1` opt-in before the server will start in
production.

Minimal setup:

1. Set `SELF_HOSTED_MODE=true` in `.env`.
2. Either:
   - add `x-chat-user: <evm_address>` to each request, or
   - set `SELF_HOSTED_DEFAULT_ADDRESS` once and omit the header.
3. Optional but recommended: set `SELF_HOSTED_SHARED_SECRET` and send it as `x-chat-auth`.

Note: this mode is meant for local/dev or trusted environments. If you expose the service
publicly, you should add your own auth or IP allow‑list.

Geo headers are ignored unless `CHAT_TRUST_PROXY` is configured for a trusted upstream
proxy that injects them.

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

## Environment

See `.env.example` for required values.

Key variables:
- `POSTGRES_URL`
- `REDIS_URL`
- `OPENAI_API_KEY`
- `PRIVY_APP_ID` (required unless `SELF_HOSTED_MODE=true`)
- `PRIVY_VERIFICATION_KEY` (required in production unless `SELF_HOSTED_MODE=true`)
- `DOCS_VECTOR_STORE_ID` (optional, enable docs search tool)
- `SELF_HOSTED_MODE` (optional, set to `true` to bypass Privy)
- `SELF_HOSTED_PRODUCTION_ENABLED` (optional, must be `1` to allow self-hosted mode in production)
- `SELF_HOSTED_DEFAULT_ADDRESS` (optional, fallback address in self-hosted mode)
- `SELF_HOSTED_SHARED_SECRET` (optional in development, required in self-hosted mode and in production)
- `CHAT_TRUST_PROXY` (optional, required if a trusted upstream proxy injects geo/ip headers)
- `POSTGRES_POOL_MAX` (optional, tune Postgres pool size)
- `POSTGRES_POOL_IDLE_TIMEOUT_MS` (optional)
- `POSTGRES_POOL_CONNECTION_TIMEOUT_MS` (optional)
- `POSTGRES_POOL_STATS_INTERVAL_MS` (optional, log pool stats when > 0)
- `RATE_LIMIT_ENABLED` (optional, enable app-side rate limiting)
- `RATE_LIMIT_MAX` (optional, default 30)
- `RATE_LIMIT_WINDOW_MS` (optional, default 60000)
- `OPENAI_REQUEST_TIMEOUT_MS` (optional, default 30000)
- `COBUILD_AI_CONTEXT_TIMEOUT_MS` (optional, default 7000)

## Postgres & cache guardrails

- Read replicas are used for read traffic; use `$primary` for read-after-write paths to avoid replica lag.
- Pool connections apply fixed safety timeouts (statement/lock/idle-in-tx) to prevent long-running queries from stalling the system.
- Cache-miss paths use Redis locks for high-fanout reads to avoid stampedes; prefer the lock-backed cache helpers for expensive lookups.

## Docs tool vector store ID (optional)

If you want the docs search tool, you’ll need an OpenAI vector store ID loaded into `DOCS_VECTOR_STORE_ID`.

The easiest way to get it is from the docs repo upload script:

1. In the docs repo ([github.com/cobuildwithus/cobuild-docs](https://github.com/cobuildwithus/cobuild-docs)), run:

   ```bash
   OPENAI_API_KEY=... DOCS_VECTOR_STORE_ID=... pnpm upload-docs
   ```

2. If you omit `DOCS_VECTOR_STORE_ID`, the script creates a new vector store named “Cobuild Docs”.
3. Copy the ID printed in the output (it logs `Using vector store: vs_...` and `Created vector store: vs_...`) into this repo’s `.env`.

Re-run the script when docs change; add `--purge` to replace existing files in the store.

## Database setup (canonical)

Use the canonical migration to create the current baseline schema.

```bash
psql "$POSTGRES_URL" -f migrations/0001_canonical_schema.sql
```

Notes:
- The `farcaster.profiles` table is required for `getUser` and discussion author metadata.
- The `farcaster.casts` table is required for `list-discussions`, `get-discussion-thread`, and `semantic-search-casts`.
- `farcaster.casts.text_embedding` must be `vector(256)` for semantic search.
- If you do not plan to use Farcaster tools, these tables can remain empty.
Migration file: [migrations/0001_canonical_schema.sql](https://github.com/cobuildwithus/chat-api/blob/main/migrations/0001_canonical_schema.sql)

## Tests

```bash
pnpm test
pnpm typecheck
```

## License

Licensed under the GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later).
If you interact with this service over a network, the corresponding source is available at
`/source` (or set `SOURCE_CODE_URL` to point to your fork).

## Deployment tips

### Railway

Hosted option: https://railway.app

1. Create a new Railway project and link this repo.
2. Add Postgres + Redis plugins (or your own managed services).
3. Set environment variables from `.env.example`:
   - `POSTGRES_URL` = Railway Postgres connection string
   - `REDIS_URL` = Railway Redis connection string
   - `OPENAI_API_KEY`
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
- [migrations/0001_canonical_schema.sql](migrations/0001_canonical_schema.sql) for canonical database setup.
