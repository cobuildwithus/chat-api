# Discussion Tools + Semantic Search + Reply-to-Cast (2026-03-02)

## Goal
Expose discussion board read/navigation capabilities and semantic cast search as agent-usable tools in chat-api, then add a guarded phase-2 reply-to-cast tool.

## Scope
- Add canonical REST tools:
  - `list-discussions`
  - `get-discussion-thread`
  - `semantic-search-casts`
  - `reply-to-cast` (phase 2, guarded)
- Add AI tool wrappers and registrations for model-side invocation.
- Add minimal DB schema surface in chat-api for farcaster casts needed by the tools.
- Add/adjust migrations as needed for chat-api environments missing cast table/indexes.
- Update docs/tool catalog and tests.

## Constraints
- Preserve existing `/v1/tools` and `/v1/tool-executions` contracts.
- Keep existing tool names/aliases stable; only additive changes.
- Require explicit confirmation input for `reply-to-cast`.
- Preserve conservative defaults for read/search limits and response payload size.

## Plan
1. Extend DB schema/env dependencies for cast + embedding-backed search.
2. Implement phase-1 tool executors and metadata entries in registry.
3. Implement matching AI tool wrappers and registrations.
4. Implement phase-2 `reply-to-cast` tool with strong validation/guardrails.
5. Add and update API + AI tool tests.
6. Update docs (`docs/TOOLS.md`, references, README/.env.example as needed).
7. Run required verification + completion workflow audits.

## Status
- In progress.
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
