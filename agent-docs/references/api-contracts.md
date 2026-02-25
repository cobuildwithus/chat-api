# API Contracts Reference

## Route Wiring

Routes and schemas are bound in `src/api/server.ts`:

- `POST /api/chat` -> `chatSchema` + `handleChatPostRequest`
- `POST /api/chat/new` -> `newChatSchema` + `handleChatCreateRequest`
- `GET /api/chats` -> `listChatsSchema` + `handleChatListRequest`
- `GET /api/chat/:chatId` -> `chatDetailSchema` + `handleGetChatRequest`
- `POST /api/docs/search` -> `docsSearchSchema` + `handleDocsSearchRequest`
- `POST /api/buildbot/tools/get-user` -> `buildBotToolsGetUserSchema` + `handleBuildBotToolsGetUserRequest`
- `POST /api/buildbot/tools/get-cast` -> `buildBotToolsGetCastSchema` + `handleBuildBotToolsGetCastRequest`
- `POST /api/buildbot/tools/cast-preview` -> `buildBotToolsCastPreviewSchema` + `handleBuildBotToolsCastPreviewRequest`
- `POST /api/buildbot/tools/cobuild-ai-context` -> `buildBotToolsCobuildAiContextSchema` + `handleBuildBotToolsCobuildAiContextRequest`

Chat routes run `validateChatUser` as `preHandler`. `POST /api/docs/search` is read-only and does not run chat auth prehandlers.

## Request Schema Summary

Source: `src/api/chat/schema.ts`.

### `POST /api/chat`

- Requires: `id`, `messages[]`, `type`
- Optional: `clientMessageId`, `data`, `context`
- Message parts include text/reasoning/file/image/source/tool/data variants.

### `POST /api/chat/new`

- Requires: `type`
- Optional: `data`

### `GET /api/chats`

- Optional query: `goalAddress`, `limit` (`1..100`)

### `GET /api/chat/:chatId`

- Requires param: `chatId`

### `POST /api/docs/search`

- Requires body: `query`
- Optional body: `limit` (`1..20`)
- Upstream dependency: OpenAI vector store search API (`/v1/vector_stores/{id}/search`)

### `POST /api/buildbot/tools/get-user`

- Requires body: `fname`

### `POST /api/buildbot/tools/get-cast`

- Requires body: `identifier`, `type` (`hash|url`)

### `POST /api/buildbot/tools/cast-preview`

- Requires body: `text`
- Optional body: `embeds` (max 2), `parent`

### `POST /api/buildbot/tools/cobuild-ai-context`

- Body: empty object

## Runtime Response Summary

- `POST /api/chat/new`: `{ chatId, chatGrant }`
- `GET /api/chats`: `{ chats: [...] }`
- `GET /api/chat/:chatId`: `{ chatId, type, data, messages }` + `x-chat-grant`
- `POST /api/chat`: streaming SSE response, may include refreshed `x-chat-grant`
- `POST /api/docs/search`: `{ query, count, results }`
- `POST /api/buildbot/tools/get-user`: `{ ok, result }`
- `POST /api/buildbot/tools/get-cast`: `{ ok, cast }`
- `POST /api/buildbot/tools/cast-preview`: `{ ok, cast }`
- `POST /api/buildbot/tools/cobuild-ai-context`: `{ ok, data }`

## Intentional Status-Code Semantics

- Missing or unauthorized chat access returns `404` on read/write chat-id paths.
- Auth pre-handler returns `401` for invalid/missing auth.
- Usage limiter returns `429` for token-budget overage.
- Buildbot tools routes apply route-local Redis-backed throttling and return `429` with `Retry-After` when exceeded.

## Schema/Runtime Mismatches (Current)

1. `type` is a free-form string in schema, while runtime agent selection supports only `chat-default`.
2. `goalAddress` accepts any string in schema; handler applies filter only if value parses as valid address.
3. Message schema requires message ids, while storage path can generate missing ids.
4. Request schemas exist, but route response schemas are not defined.

## Update Rule

When editing route handlers, schemas, or status semantics, update this file in the same change.
