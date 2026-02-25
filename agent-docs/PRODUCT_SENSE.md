# Product Sense

## Core Product Expectations

- Chat requests should either stream useful output or fail quickly with an actionable error.
- Chat ownership and grant behavior should feel stable across retries and reconnects.
- API behavior should prioritize predictability over cleverness.

## UX Contract for API Consumers

- A chat created via `/api/chat/new` must be immediately usable in `/api/chat`.
- `/api/chat/:chatId` should always return a refreshed grant for continuation.
- Missing or unauthorized chats return `404` to avoid identity or resource leakage.
- Validation and auth failures should be explicit enough for clients to recover.

## Communication Constraints

- Default assistant language should avoid investment framing and legal claims.
- Tool outputs should be used to ground responses rather than fabricate detail.
- When confidence is low, assistant behavior should be explicit and bounded.

## Change Management Rules

- Treat response-shape changes as contract changes.
- Record compatibility notes when introducing new fields or semantics.
- Any auth/grant behavior change requires updates to product spec + security docs.
