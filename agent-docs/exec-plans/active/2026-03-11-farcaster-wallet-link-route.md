Goal
- Provide a chat-api-owned CLI-authenticated endpoint that records Farcaster `fid` to wallet links in `farcaster.profiles` by populating both `verified_addresses` and `manual_verified_addresses`.

Constraints/Assumptions
- Endpoint must accept CLI bearer auth and require `wallet:execute`.
- Keep writes scoped to `farcaster.profiles`; linked social accounts remain out of scope.

Key decisions
- Add a dedicated `/v1` route instead of extending tool execution.
- Implement a DB helper that preserves existing verified/manual arrays and backfills the manual array when only verified already contains the address.

State
- Done: confirmed chat-api already owns CLI session validation and bearer-token verification primitives.
- Done: added the wallet-link auth hook, parser, route handler, DB helper, docs, and tests.
- Done: verified with `pnpm typecheck`, `pnpm test`, `pnpm test:coverage`, `bash scripts/check-agent-docs-drift.sh`, and `bash scripts/doc-gardening.sh --fail-on-issues`.
- Done: route authorization now allows only the CLI owner wallet (local signup) or the stored hosted agent wallet (hosted/CDP signup), then verifies onchain `idOf(address) === fid` before writing.
- Done: added validation/runtime-parity coverage plus hosted-wallet query coverage for the hardened route.
- Done: re-verified with `pnpm typecheck`, `pnpm test`, `pnpm test:coverage`, `bash scripts/check-agent-docs-drift.sh`, and `bash scripts/doc-gardening.sh --fail-on-issues`.
- Now: none.
- Next: none.
