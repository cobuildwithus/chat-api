# Security

## Hard Constraints

- Never access `.env` or `.env*` files.
- Treat auth validation and grant signing/verification as high-sensitivity boundaries.
- Validate request payloads and tool inputs with explicit schemas.
- Avoid exposing secrets or excessive internals in logs/error payloads.

## Trust Boundaries

1. Client -> API boundary (`src/api/**`)
- Request schema validation
- Header auth handling
2. Interface backend -> buildbot tools boundary (`/api/buildbot/tools/*`)
- Shared service header gate via `x-chat-internal-key`
- Fail-closed semantics when internal key config is missing (`503`)
 - Config source: `CHAT_INTERNAL_SERVICE_KEY` (legacy fallback: `BUILD_BOT_TOOLS_INTERNAL_KEY`)
3. Interface backend -> docs-search boundary (`/api/docs/search`)
- Shared service header gate via `x-chat-internal-key`
- Route-local Redis-backed throttling to cap OpenAI spend/DoS surface
4. API -> Auth boundary (`src/api/auth/**`)
- Privy JWT verification mode
- Self-hosted header/shared-secret mode
5. API -> Data boundary (`src/infra/db/**`, `src/infra/redis.ts`)
- Ownership checks
- grant validation + issuance
6. API -> External services (`OpenAI`, `Neynar`, `co.build`)
- timeout-bounded requests
- constrained tool surfaces

## Auth Model Notes

- Privy mode requires valid JWT and linked wallet extraction.
- Self-hosted mode can rely on:
- `x-chat-user` / default address
- `x-chat-auth` shared secret
- Production self-hosted mode requires `SELF_HOSTED_SHARED_SECRET` at startup and middleware level.

## Grant Security Notes

- Grants are signed JWTs with short TTL and scoped claims.
- `/api/chat` enforces grant consistency, with DB ownership fallback.
- Grant refresh happens on read (`GET /api/chat/:chatId`) and on write when needed.

## Defensive Behavior

- Unauthorized/missing chat access returns `404` (not `403`) to reduce enumeration signal.
- Error handler returns structured failures while avoiding full secret exposure.

## Current Security Gaps

1. Response schemas are not declared, reducing automated contract enforcement.
2. Shared-secret headers use static key auth; stronger network controls (mTLS/IP allowlisting) remain defense-in-depth options.

## Security Review Checklist (Per PR)

1. Are auth/grant flows changed? If yes, update this doc and `agent-docs/product-specs/chat-api-behavior.md`.
2. Are new headers/log fields introduced? If yes, verify redaction requirements.
3. Are new external calls added? If yes, set explicit timeout and bounded error behavior.
4. Are ownership checks preserved on all chat read/write paths?
5. If internal service headers are introduced/changed, are they validated and redacted?

## Escalation

Escalate to humans for:

- auth model or claim/issuer/audience changes,
- grant format/signature/TTL changes,
- permission model changes,
- legal/compliance-sensitive copy or behavior.
