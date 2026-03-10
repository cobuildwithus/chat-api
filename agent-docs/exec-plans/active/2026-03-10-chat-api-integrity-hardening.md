# Harden chat integrity, quota admission, and tool exposure

Status: active
Created: 2026-03-10
Updated: 2026-03-10

## Goal

- Remove the review-identified integrity, quota, auth-surface, and read-correctness issues in chat/runtime/tooling paths without regressing existing product behavior.

## Success criteria

- `POST /api/chat` accepts only a new user turn plus bounded metadata/attachments, rebuilds prior history from DB, and never trusts client-supplied assistant/tool transcript state.
- Chat message persistence becomes append-only/idempotent enough to prevent client snapshot reconciliation from deleting or overwriting trusted rows.
- AI quota admission is atomic before model work begins, request disconnects stop upstream work, and in-flight generation is bounded.
- Internal AI tool execution requires explicit chat-safe exposure instead of implicitly allowing default read-only registry tools.
- Error responses, DB session setup, route validation, indexed inspect lookups, and recent chat reads are hardened per review findings.
- Required checks and completion-workflow audits pass.

## Scope

- In scope:
- `src/api/chat/**`
- `src/chat/**`
- `src/ai/**`
- `src/api/tools/**`
- `src/tools/registry.ts`
- `src/infra/**`
- `src/api/auth/**`
- `src/domains/protocol/**`
- `src/domains/notifications/service.ts`
- matching `tests/**`
- matching `agent-docs/**`
- Out of scope:
- `src/domains/notifications/presentation.ts` existing unrelated dirty work
- unrelated active notification exec plans/doc inventory work

## Constraints

- Technical constraints:
- Keep persisted server-generated assistant/tool messages authoritative.
- Preserve current chat grant/ownership semantics unless required for safety.
- Stay on indexed DB reads for protocol inspection; do not reintroduce onchain event decoding for read tools.
- Product/process constraints:
- Do not revert or rewrite unrelated dirty files.
- Run simplify, test-coverage-audit, and task-finish-review passes before handoff.

## Risks and mitigations

1. Risk: Chat contract tightening can break existing clients.
   Mitigation: Keep request shape backward-compatible where possible, but ignore or reject untrusted transcript fields and add focused regression tests around supported payloads.
2. Risk: Quota/in-flight controls can create stuck reservations or false rejects.
   Mitigation: Use bounded reservation lifecycle with explicit cleanup on abort/failure and test race/abort paths.
3. Risk: Auth exposure changes can inadvertently hide legitimate internal tools.
   Mitigation: Add explicit exposure metadata and regression tests for chat-safe vs bearer-only tools.

## Tasks

1. Harden chat POST/schema/storage so the server rebuilds authoritative history and appends new turns safely.
2. Make AI usage admission atomic, add in-flight caps, and abort upstream generation on disconnect.
3. Tighten tool exposure/auth defaults for internal AI execution.
4. Harden DB session initialization, public error shaping, chat read consistency, and geo trust handling.
5. Fix indexed inspect ambiguity/efficiency issues and notification payload shaping.
6. Update docs/tests, run required checks, then run completion-workflow audits.

## Decisions

- Keep the public `POST /api/chat` envelope, but narrow accepted semantics to one new user turn plus client-side metadata/attachments; prior assistant/tool transcript content is ignored/rejected.

## Verification

- Commands to run:
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
- Expected outcomes:
- All commands pass and new tests cover the hardened chat/quota/auth/indexed-inspect behavior.
