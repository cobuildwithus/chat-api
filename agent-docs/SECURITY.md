# Security

## Hard Constraints

- Never access `.env` or `.env*` files.
- Treat auth validation and ownership enforcement as high-sensitivity boundaries.
- Validate request payloads and tool inputs with explicit schemas.
- Avoid exposing secrets or excessive internals in logs/error payloads.

## Trust Boundaries

1. Client -> API boundary (`src/api/**`)
- Request schema validation
- Header auth handling
2. Interface/CLI runtime -> bearer-authenticated `/v1` boundary (`/v1/tools`, `/v1/tools/:name`, `/v1/tool-executions`, `/v1/farcaster/profiles/link-wallet`)
- Bearer PAT gate via `Authorization: Bearer <bbt_...>`
- Shared `@cobuild/wire` bearer verifier parses tokens, derives principals, and requires the backing CLI session to remain active with a matching stored scope
- A shared bearer-auth guard sets both chat-user and tools-principal request context before per-route scope enforcement runs
- Per-route scope enforcement then applies (`tools:read` for discovery/execution metadata, `wallet:execute` for Farcaster wallet-link sync)
- The Farcaster wallet-link route only accepts wallets already authorized for the CLI session (owner wallet for local signup, hosted agent wallet for hosted/CDP signup) and verifies the `fid` onchain before mutating `farcaster.profiles`
- Invalid or missing bearer token returns `401`
3. API -> Auth boundary (`src/api/auth/**`)
- Privy JWT verification mode
- Self-hosted header/shared-secret mode
4. API -> Data boundary (`src/infra/db/**`, `src/infra/redis.ts`)
- Ownership checks
5. API -> External services (`OpenAI`, `co.build`)
- timeout-bounded requests
- constrained tool surfaces

## Auth Model Notes

- Privy mode requires valid JWT and linked wallet extraction.
- Self-hosted mode can rely on:
- `x-chat-user` / default address
- `x-chat-auth` shared secret
- Chat-user principals normalize wallet addresses before request-context storage, so downstream ownership checks and tool wallet binding read the canonical subject wallet shape.
- Production self-hosted mode requires `SELF_HOSTED_SHARED_SECRET` and `SELF_HOSTED_PRODUCTION_ENABLED=1` at startup; middleware rejects misconfigured runtime use as well.
- Request geo headers are treated as untrusted and ignored unless `CHAT_TRUST_PROXY` is configured for a trusted upstream proxy.
- Auth for chat/tools/token routes runs in `preValidation`, so authenticated principals are available to `preHandler` rate-limit key generation.

## Chat Access Notes

- Chat read/write authorization is enforced by matching the authenticated wallet to the stored chat owner.
- Unauthorized or missing chats intentionally resolve to `404` to reduce enumeration signal.

## Defensive Behavior

- Unauthorized/missing chat access returns `404` (not `403`) to reduce enumeration signal.
- Error handler returns structured failures while avoiding full secret exposure.

## Current Security Gaps

1. Response schemas are not declared, reducing automated contract enforcement.
2. Shared-secret headers use static key auth; stronger network controls (mTLS/IP allowlisting) remain defense-in-depth options.

## Security Review Checklist (Per PR)

1. Are auth or ownership-enforcement flows changed? If yes, update this doc and `agent-docs/product-specs/chat-api-behavior.md`.
2. Are new headers/log fields introduced? If yes, verify redaction requirements.
3. Are new external calls added? If yes, set explicit timeout and bounded error behavior.
4. Are ownership checks preserved on all chat read/write paths?
5. If tool auth handling changes, are bearer tokens validated and redacted?
6. If a wallet-scoped tool reads private inbox state, is the wallet derived only from authenticated context?
7. If a bearer-authenticated `/v1` route mutates wallet-linked state, does it require `wallet:execute`?
8. If a bearer-authenticated `/v1` route persists Farcaster wallet links, does it prove both wallet authorization and onchain `fid` ownership before writing?

## Escalation

Escalate to humans for:

- auth model or claim/issuer/audience changes,
- permission model changes,
- legal/compliance-sensitive copy or behavior.
