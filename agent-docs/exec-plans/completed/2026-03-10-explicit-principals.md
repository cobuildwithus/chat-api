# Split principal handling into explicit types and helpers

Status: completed
Created: 2026-03-10
Updated: 2026-03-10

## Goal

- Consolidate auth/grant/user-context principal handling into explicit source-of-truth types and helpers so chat auth, tools auth, notification subject resolution, and registry auth checks stop reconstructing principals ad hoc.

## Success criteria

- `ChatUserPrincipal`, `ToolsPrincipal`, and `SubjectWallet` become explicit shared types/helpers instead of anonymous inline shapes.
- Chat auth uses a dedicated principal setter/getter path instead of a generic header-to-user helper.
- Tools auth stores and reads a typed tools principal from request context without notification-specific reconstruction code.
- Notification subject resolution becomes an explicit helper built on the shared principal types and preserves current fallback behavior.
- Tool registry auth and wallet-bound tool execution read from the shared helpers with no behavior regression.
- Existing auth/tools/notification tests pass with focused updates for the new helper boundaries.

## Scope

- In scope:
- `src/api/auth/**`
- `src/api/tools/**`
- `src/domains/notifications/service.ts`
- `src/domains/notifications/wallet-subject.ts`
- `src/tools/registry.ts`
- matching `tests/**`
- matching `agent-docs/**`
- Out of scope:
- route contract changes
- grant format changes
- unrelated notification presentation work

## Constraints

- Technical constraints:
- Preserve current request-context keys and runtime behavior unless a rename materially improves clarity without affecting consumers.
- Keep wallet normalization semantics identical to current auth flows.
- Product/process constraints:
- Do not overwrite unrelated active edits.
- Run simplify, test-coverage-audit, and task-finish-review passes before handoff.

## Risks and mitigations

1. Risk: Re-homing helper logic can subtly change auth fallback behavior.
   Mitigation: Keep subject-wallet fallback semantics explicit and add/update tests around chat-user fallback vs tools-principal precedence.
2. Risk: New shared types can create circular imports across auth/tools/domains modules.
   Mitigation: Keep principal types/helpers in a small auth-focused module boundary and use type-only imports where possible.

## Tasks

1. Introduce explicit principal types/helpers for chat users, tools auth, and subject-wallet resolution.
2. Migrate auth middleware, notification service, and registry checks to the new helpers.
3. Update focused tests for principal typing and context resolution behavior.
4. Run required verification and completion-workflow audits.

## Decisions

- Keep request-context storage keys as `user` and `toolsPrincipal` unless the implementation reveals a cleaner migration with low blast radius.

## Verification

- Commands to run:
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
- Expected outcomes:
- All commands pass and auth/tools/notification tests continue to cover principal resolution semantics.
Completed: 2026-03-10
