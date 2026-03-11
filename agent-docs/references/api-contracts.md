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
- `POST /v1/farcaster/profiles/link-wallet` -> `farcasterWalletLinkSchema` + `handleFarcasterWalletLinkRequest`
- `GET /v1/tokens` -> `cliTokensListSchema` + `handleCliTokensListRequest`
- `POST /v1/tokens` -> `cliTokenCreateSchema` + `handleCliTokenCreateRequest`
- `DELETE /v1/tokens` -> `cliTokenRevokeSchema` + `handleCliTokenRevokeRequest`

Chat routes run `validateChatUser` as `preValidation`.
Canonical tool routes run `enforceToolsBearerAuth` as `preValidation`.
The wallet-link sync route runs `enforceWalletExecuteBearerAuth` as `preValidation`.
Token management routes run `validateChatUser` as `preValidation`.

## Request Schema Summary

Source: route schema modules under `src/api/**/schema.ts`, generated from shared Zod request definitions via `src/api/zod-route-schema.ts`.

### `POST /api/chat`

- Requires: `chatId`, `clientMessageId`, `userMessage`
- Optional: `attachments[]`, `context`
- Header schema includes optional `x-client-device`

### `POST /api/chat/new`

- Requires: `type` (`chat-default`)
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

### `POST /v1/farcaster/profiles/link-wallet`

- Requires body: `fid`, `address`
- Requires header: `Authorization: Bearer <bbt_...>`
- Requires the backing CLI session/token to include `wallet:execute`
- `address` must be a valid EVM address
- Route only accepts:
  - the CLI session owner wallet for local signup sync
  - the server-known hosted agent wallet for the CLI session owner + agent key on hosted/CDP signup sync
- Route verifies onchain via Farcaster IdRegistry that `idOf(address) === fid` before writing

### `GET /v1/tokens`

- Requires header: `privy-id-token`

### `POST /v1/tokens`

- Requires header: `privy-id-token`
- Optional body: `label`, `agentKey`

### `DELETE /v1/tokens`

- Requires header: `privy-id-token`
- Requires body: `tokenId`

### Canonical tools auth

- `/v1/tools`, `/v1/tools/:name`, and `/v1/tool-executions` require a valid cli PAT bearer token.
- `/v1/farcaster/profiles/link-wallet` requires a valid cli PAT bearer token with `wallet:execute`.

## Runtime Response Summary

- `POST /api/chat/new`: `{ chatId }`
- `GET /api/chats`: `{ chats: [...] }`
- `GET /api/chat/:chatId`: `{ chatId, type, data, messages }`
- `POST /api/chat`: streaming SSE response
- `GET /v1/tools`: `{ tools: ToolMetadata[] }`
- `GET /v1/tools/:name`: `{ tool: ToolMetadata }` or `404` with `{ error }`
- `POST /v1/tool-executions`: success `{ ok: true, name, output }`; failure `{ ok: false, name, statusCode, error }`
- `POST /v1/farcaster/profiles/link-wallet`: `{ ok: true, fid, address }`
- `GET /v1/tokens`: `{ ok: true, tokens }`
- `POST /v1/tokens`: `{ ok: true, token, tokenInfo }`
- `DELETE /v1/tokens`: `{ ok: true, revoked }`

## Intentional Status-Code Semantics

- Missing or unauthorized chat access returns `404` on read/write chat-id paths.
- Auth pre-validation returns `401` for invalid/missing auth.
- `POST /v1/farcaster/profiles/link-wallet` returns `403` when the bearer token lacks `wallet:execute`.
- `POST /v1/farcaster/profiles/link-wallet` returns `403` when the requested wallet is not authorized for the authenticated CLI session or the onchain `fid` owner does not match.
- `POST /v1/farcaster/profiles/link-wallet` returns `502` when Farcaster ownership verification cannot be completed.
- Usage limiter returns `429` for token-budget overage.
- Canonical tools auth returns `401` for missing/invalid bearer token.
- Canonical tool execution returns `403` when the bearer token is missing a tool-specific required scope.
- `GET /v1/tools/:name` returns `404` with `{ error: "Unknown tool \"...\"." }` when name/alias is not registered.
- Tool/config dependency failures return stable mapped public errors while preserving status codes (`503` for unavailable configuration, `502` for execution failures).
- Ambiguous indexed goal route identifiers surface as canonical tool execution failures with `409` / `Goal identifier is ambiguous. Use a canonical address instead.`
- Global `5xx` responses use generic public envelopes in every environment; raw exception names/messages stay in logs only.

## Schema/Runtime Mismatches (Current)

1. `goalAddress` remains in the chat-list query schema for compatibility, but the handler ignores it.
2. Zod-to-JSON-Schema generation does not encode runtime-only transform/coercion behavior, so routes that rely on those paths need integration coverage.
3. Request schemas exist, but route response schemas are not defined.

## Update Rule

When editing route handlers, schemas, or status semantics, update this file in the same change.
