# Chat API Behavior

## Endpoint Contracts

### POST `/api/chat/new`

Request body:
- required: `type` (`chat-default`)
- optional: `data` (object)

Behavior:
- creates user-owned chat row
- returns `{ chatId }`
- on failure returns `500` with `Failed to create chat`

### POST `/api/chat`

Request body:
- required: `chatId`, `clientMessageId`, `userMessage`
- optional: `attachments[]`, `context`

Behavior:
- enforces auth and wallet ownership for the target chat
- applies usage limiter before streaming
- stores the user message idempotently by `clientMessageId`
- streams assistant output
- persists pending + final message state

Error behavior:
- `404` for missing/unauthorized chat id
- `429` when usage limit is exceeded
- `409` when the chat request reuses an already-processed `clientMessageId`
- stream error payload on downstream/model failures

### GET `/api/chats`

Query:
- optional: `goalAddress`, `limit` (`1..100`)

Behavior:
- returns current user chat list sorted by `updatedAt`
- applies optional goal-address filtering when address is valid

### GET `/api/chat/:chatId`

Params:
- required: `chatId`

Behavior:
- ownership check
- returns `{ chatId, type, data, messages }`
- returns `404` when inaccessible

### GET `/v1/tools`

Behavior:
- requires bearer token `Authorization: Bearer <bbt_...>`
- returns canonical registry metadata for all tools as `{ tools: [...] }`

Error behavior:
- `401` when bearer token is missing/invalid

### GET `/v1/tools/:name`

Params:
- required: `name` (canonical name or alias)

Behavior:
- require bearer token `Authorization: Bearer <bbt_...>`
- if header is missing or invalid, return `401`
- returns canonical metadata as `{ tool: ... }` for registered tool names/aliases

Error behavior:
- `404` with `{ error: "Unknown tool \"...\"." }` when tool name/alias does not exist

### POST `/v1/tool-executions`

Request body:
- required: `name` (canonical name or alias)
- optional: `input` (object)

Behavior:
- require bearer token `Authorization: Bearer <bbt_...>`
- if header is missing or invalid, return `401`
- if the resolved tool declares additional required scopes and the token does not include them, return `403`
- executes canonical tool registry entry and returns `{ ok, name, output }`

Error behavior:
- propagates tool execution errors as stable public `{ error }` strings with tool-defined HTTP status codes
- dependency/configuration failures use stable mapped messages (`Tool request failed.` / `Tool is unavailable.`) instead of raw upstream text

## Auth Compatibility

- Chat authorization is based on authenticated wallet ownership of the target chat.
- Self-hosted mode in production requires shared-secret protection.

## Known Schema/Runtime Caveats

1. `goalAddress` schema accepts any string, runtime filters only when value is valid address.
2. Route schemas validate request bodies but currently do not define response schemas.

## Required Update Triggers

Update this document whenever changes affect:

- endpoint request fields,
- response payload shape or headers,
- auth behavior,
- error semantics or status-code policy.
