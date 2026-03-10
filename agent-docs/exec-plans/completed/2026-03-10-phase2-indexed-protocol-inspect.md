# 2026-03-10 Phase 2 Indexed Protocol Inspect

## Goal

Expand the read-safe protocol inspect surface with canonical indexed tools for TCR requests, arbitrator disputes, stake status, and premium escrow state.

## Scope

- Add direct-DB schema bindings for the indexed protocol tables needed by the next inspect slice.
- Extend the protocol indexed-inspect domain with normalized TCR request, dispute, stake, and premium escrow readers.
- Register canonical inspect tools and AI wrappers for the new read-only surfaces.
- Keep the tool contract read-only and indexed-data-backed; do not add onchain event replay or write execution in this slice.

## Constraints

- Read directly from the shared database; do not add an indexer GraphQL dependency.
- Keep `chat-api` inspect/planning-centric and avoid protocol write tools.
- Prefer stable indexed identifiers already emitted by the indexer over inventing new lookup keys.

## Planned Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
