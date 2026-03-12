# REST-First Tool Registry + Shared Execution (2026-03-01)

## Goal
Introduce a canonical REST-first tool registry and execution path for cli tool routes and docs search, then expose `/v1/tools` and `/v1/tool-executions` while preserving legacy route contracts.

## Scope
- Add canonical tool registry metadata + execution module.
- Add `/v1/tools` and `/v1/tool-executions` route handlers and schemas.
- Rewire legacy `/api/cli/tools/*` and `/api/docs/search` handlers to shared execution logic.
- Add chat runtime optimization to skip cobuild context snapshot prompt fetch when request `context` is provided.
- Update tests for new routes and shared-path behavior.

## Constraints
- Preserve legacy response shapes and prehandler wiring.
- Use existing internal key auth guard for `/v1/*`.
- Keep runtime behavior stable outside the explicit context optimization.

## Plan
1. Create shared registry metadata + execution layer.
2. Delegate legacy handlers to the shared execution layer.
3. Add canonical `/v1` tool endpoints.
4. Add focused tests for new endpoints and runtime context behavior.
5. Run required verification checks.

## Status
- Completed.
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
