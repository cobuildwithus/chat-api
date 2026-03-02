# Chat API Behavior

## Endpoint Contracts

### POST `/api/chat/new`

Request body:
- required: `type` (string)
- optional: `data` (object)

Behavior:
- creates user-owned chat row
- returns `{ chatId, chatGrant }`
- on failure returns `500` with `Failed to create chat`

### POST `/api/chat`

Request body:
- required: `id`, `messages[]`, `type`
- optional: `clientMessageId`, `context`, `data`

Behavior:
- enforces auth and chat ownership/grant validity
- applies usage limiter before streaming
- streams assistant output
- persists pending + final message state
- may return refreshed `x-chat-grant`

Error behavior:
- `404` for missing/unauthorized chat id
- `429` when usage limit is exceeded
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
- always emits refreshed `x-chat-grant`
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
- executes canonical tool registry entry and returns `{ ok, name, output }`

Error behavior:
- propagates tool execution errors as `{ error }` with tool-defined HTTP status codes

## Auth + Grant Compatibility

- Chat grant format and semantics must remain backward compatible unless explicitly versioned.
- Grant refresh behavior is part of client continuation contract.
- Ownership checks are mandatory fallback even when grant is present.
- Self-hosted mode in production requires shared-secret protection.

## Known Schema/Runtime Caveats

1. Schema accepts free-form `type`, runtime currently supports only `chat-default`.
2. `goalAddress` schema accepts any string, runtime filters only when value is valid address.
3. Route schemas validate request bodies but currently do not define response schemas.

## Required Update Triggers

Update this document whenever changes affect:

- endpoint request fields,
- response payload shape or headers,
- auth/grant behavior,
- error semantics or status-code policy.
