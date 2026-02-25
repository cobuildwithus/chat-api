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

### POST `/api/docs/search`

Request body:
- required: `query` (string)
- optional: `limit` (number, `1..20`)

Behavior:
- executes OpenAI vector store search against `DOCS_VECTOR_STORE_ID`
- returns `{ query, count, results[] }` with snippet + metadata per hit
- does not require chat-user auth headers; endpoint is additive and read-only

Error behavior:
- `400` for empty/whitespace query
- `503` when docs search configuration is missing
- `502` for upstream OpenAI failure or invalid upstream payload

### POST `/api/buildbot/tools/get-user`
### POST `/api/buildbot/tools/get-cast`
### POST `/api/buildbot/tools/cast-preview`
### POST `/api/buildbot/tools/cobuild-ai-context`

Behavior:
- require internal service header `x-chat-internal-key`
- if internal key config is missing, return `503`
- if header is missing or invalid, return `401`
- when internal auth passes, preserve existing route-local behavior and payload semantics

## Auth + Grant Compatibility

- Chat grant format and semantics must remain backward compatible unless explicitly versioned.
- Grant refresh behavior is part of client continuation contract.
- Ownership checks are mandatory fallback even when grant is present.

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
