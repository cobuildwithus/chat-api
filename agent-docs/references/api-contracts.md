# API Contracts Reference

## Route Wiring

Routes and schemas are bound in `src/api/server.ts`:

- `POST /api/chat` -> `chatSchema` + `handleChatPostRequest`
- `POST /api/chat/new` -> `newChatSchema` + `handleChatCreateRequest`
- `GET /api/chats` -> `listChatsSchema` + `handleChatListRequest`
- `GET /api/chat/:chatId` -> `chatDetailSchema` + `handleGetChatRequest`
- `GET /v1/tools` -> `toolsListSchema` + `handleToolsListRequest`
- `GET /v1/tools/:name` -> `toolMetadataSchema` + `handleToolMetadataRequest`
- `POST /v1/tool-executions` -> `toolExecutionSchema` + `handleToolExecutionRequest`
- `GET /v1/tokens` -> `buildBotTokensListSchema` + `handleBuildBotTokensListRequest`
- `POST /v1/tokens` -> `buildBotTokenCreateSchema` + `handleBuildBotTokenCreateRequest`
- `DELETE /v1/tokens` -> `buildBotTokenRevokeSchema` + `handleBuildBotTokenRevokeRequest`

Chat routes run `validateChatUser` as `preValidation`.
Canonical tool routes run `enforceToolsBearerAuth` as `preValidation`.
Token management routes run `validateChatUser` as `preValidation`.

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

### `GET /v1/tools`

- Requires header: `Authorization: Bearer <bbt_...>`

### `GET /v1/tools/:name`

- Requires param: `name` (`1..128` chars, supports canonical name or alias)
- Requires header: `Authorization: Bearer <bbt_...>`

### `POST /v1/tool-executions`

- Requires body: `name`
- Optional body: `input` (object)
- Requires header: `Authorization: Bearer <bbt_...>`

### `GET /v1/tokens`

- Requires header: `privy-id-token`

### `POST /v1/tokens`

- Requires header: `privy-id-token`
- Optional body: `label`, `agentKey`

### `DELETE /v1/tokens`

- Requires header: `privy-id-token`
- Requires body: `tokenId`

### Canonical tools auth

- `/v1/tools`, `/v1/tools/:name`, and `/v1/tool-executions` require a valid build-bot PAT bearer token.

## Runtime Response Summary

- `POST /api/chat/new`: `{ chatId, chatGrant }`
- `GET /api/chats`: `{ chats: [...] }`
- `GET /api/chat/:chatId`: `{ chatId, type, data, messages }` + `x-chat-grant`
- `POST /api/chat`: streaming SSE response, may include refreshed `x-chat-grant`
- `GET /v1/tools`: `{ tools: ToolMetadata[] }`
- `GET /v1/tools/:name`: `{ tool: ToolMetadata }` or `404` with `{ error }`
- `POST /v1/tool-executions`: success `{ ok: true, name, output }`; failure `{ ok: false, name, statusCode, error }`
- `GET /v1/tokens`: `{ ok: true, tokens }`
- `POST /v1/tokens`: `{ ok: true, token, tokenInfo }`
- `DELETE /v1/tokens`: `{ ok: true, revoked }`

## Intentional Status-Code Semantics

- Missing or unauthorized chat access returns `404` on read/write chat-id paths.
- Auth pre-validation returns `401` for invalid/missing auth.
- Usage limiter returns `429` for token-budget overage.
- Canonical tools auth returns `401` for missing/invalid bearer token.
- `GET /v1/tools/:name` returns `404` with `{ error: "Unknown tool \"...\"." }` when name/alias is not registered.
- `semantic-search-casts` returns `503` for missing OpenAI config and `502` for upstream embedding failures.

## Schema/Runtime Mismatches (Current)

1. `type` is a free-form string in schema, while runtime agent selection supports only `chat-default`.
2. `goalAddress` accepts any string in schema; handler applies filter only if value parses as valid address.
3. Message schema requires message ids, while storage path can generate missing ids.
4. Request schemas exist, but route response schemas are not defined.

## Update Rule

When editing route handlers, schemas, or status semantics, update this file in the same change.
