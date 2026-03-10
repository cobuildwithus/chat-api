# Align AI wrapper schemas with canonical registry validators

Status: completed
Created: 2026-03-10
Updated: 2026-03-10

## Goal

- Remove duplicated, looser AI wrapper input schemas and make registry-backed AI tools consume the canonical registry validators directly.

## Success criteria

- Registry-backed AI tools no longer define separate wrapper-local input schemas.
- The canonical registry remains the only source of truth for validation behavior.
- AI-facing field descriptions remain available from shared schemas where needed.
- Tests cover schema alignment and required validation behavior.

## Scope

- In scope:
- `src/ai/tools/**`
- `src/tools/registry.ts`
- matching `tests/ai/tools/**`
- `tests/api/tools/registry.spec.ts`
- matching `agent-docs/**`
- Out of scope:
- non-registry-backed provider-native tools
- unrelated auth/public-error/tool-exposure edits already in flight

## Constraints

- Continue on top of existing local changes in `src/tools/registry.ts`.
- Do not relax canonical validation behavior to preserve old wrapper permissiveness.
- Keep prompts and tool names stable.

## Risks and mitigations

1. Risk: AI wrapper invocation shape changes where wrappers previously defaulted or widened fields.
   Mitigation: use the registry validator as-is and add explicit tests documenting alignment.
2. Risk: losing field descriptions when removing wrapper-local schemas.
   Mitigation: move useful descriptions onto the canonical registry schemas before sharing them.

## Tasks

1. Export shared registry input schema access.
2. Move useful field descriptions into canonical registry schemas.
3. Refactor registry-backed AI wrappers to consume shared schemas.
4. Add alignment tests and run required verification.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
Completed: 2026-03-10
