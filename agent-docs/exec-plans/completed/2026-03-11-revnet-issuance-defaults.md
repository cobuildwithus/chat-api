# Revnet Issuance Terms Default Inputs

Status: completed
Created: 2026-03-11
Updated: 2026-03-12

## Goal

- Let `get-revnet-issuance-terms` succeed when callers omit `projectId`, so downstream clients can rely on the same default project behavior already implemented in `getRevnetIssuanceTermsSnapshot`.

## Success criteria

- Tool execution accepts `{}` and still returns the issuance snapshot using infra defaults.
- Explicit `projectId` and `chainId` overrides continue to work unchanged.
- Tool docs describe the omitted-`projectId` default behavior.

## Scope

- In scope:
  - Relax the tool input schema so `projectId` is optional.
  - Omit undefined fields when forwarding params into the infra snapshot loader.
  - Add regression coverage for the empty-input path and keep existing failure coverage.
  - Update tool docs for the defaulted project behavior.
- Out of scope:
  - Changing the infra default project selection itself.
  - Any wallet execution or new revnet write behavior.

## Constraints

- Technical constraints:
  - Keep `chainId` override support intact.
  - Preserve strict input-object validation for unknown fields.
- Product/process constraints:
  - `chat-api` remains the canonical tool contract that `cli` consumes.
  - Required repo verification and completion workflow audits still apply.

## Risks and mitigations

1. Risk: Relaxing the schema could accidentally forward `projectId: undefined` and bypass the intended defaults.
   Mitigation: Build the infra params object with conditional spreads and assert the empty-input call in tests.

2. Risk: Tool docs could still imply that `projectId` is required.
   Mitigation: Update the public tools doc and internal tool catalog in the same change.

## Tasks

1. Update the context tool schema/executor to treat `projectId` as optional and omit undefined params.
2. Add execution tests for the empty-input path and preserve validation/failure coverage.
3. Update revnet issuance tool docs to describe the default-project behavior.
4. Run required audits and verification, then close the plan.

## Decisions

- Keep the defaulting behavior in the infra layer and align the tool contract to it rather than duplicating defaults in the registry.

## Verification

- Commands to run:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:coverage`
  - `bash scripts/check-agent-docs-drift.sh`
  - `bash scripts/doc-gardening.sh --fail-on-issues`
- Expected outcomes:
  - All commands pass after the schema/defaulting change and doc updates.
Completed: 2026-03-12
