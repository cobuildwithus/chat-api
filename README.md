# chat-api

Minimal chat service for Cobuild. Exposes only chat endpoints and uses the existing Cobuild Postgres + Redis.

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

## Environment

See `.env.example` for required values.

Key variables:
- `COBUILD_POSTGRES_URL`
- `COBUILD_REDIS_URL`
- `OPENAI_API_KEY`
- `PRIVY_APP_ID`
- `PRIVY_VERIFICATION_KEY`
- `CHAT_GRANT_SECRET`
- `NEYNAR_API_KEY_NOTIFICATIONS` (for getCast tool)

## Development

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Tests

```bash
pnpm test
pnpm typecheck
```

## Docs

- `ARCHITECTURE.md` for the module map and request flow.
- `docs/TOOLS.md` for adding and registering tools.
- `CONTRIBUTING.md` for contribution guidelines.
