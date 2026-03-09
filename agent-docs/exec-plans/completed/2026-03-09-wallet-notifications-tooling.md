# 2026-03-09 Wallet Notifications Tooling

## Goal

Ship a read-only `list-wallet-notifications` canonical tool in `chat-api` with subject-wallet-only scoping, cursor pagination, unread metadata, and explicit per-tool scope enforcement.

## Scope

- Add a notifications domain module in `chat-api` for wallet resolution, cursor encoding/decoding, query execution, and output mapping.
- Register `list-wallet-notifications` in the canonical tool registry without exposing it in the AI wrapper set.
- Replace route-level binary write gating with per-tool auth policy checks that can require `notifications:read`.
- Add tests for tool execution, metadata/auth policy behavior, and updated scope validation docs.

## Constraints

- The tool must never accept a wallet address as input.
- The subject wallet resolves from authenticated tool principal first, then request user context.
- Read calls must be side-effect free and return `Cache-Control: no-store`.
- Keep notification visibility semantics aligned with the current interface query contract.
- Do not ship the write/ack tool in this change.

## Verification

- Required checks: `pnpm typecheck`, `pnpm test`, `pnpm test:coverage`, `bash scripts/check-agent-docs-drift.sh`, `bash scripts/doc-gardening.sh --fail-on-issues`
- Completion workflow: simplify -> test-coverage-audit -> task-finish-review
Status: completed
Updated: 2026-03-09
Completed: 2026-03-09
