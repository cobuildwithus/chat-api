# CLI Tools Routes (2026-02-25)

## Goal
Expose cli tools 1-4 via chat-api routes with schema validation, route-level rate limiting, and caching headers/behavior aligned to endpoint semantics.

## Scope
- Add `/api/cli/tools/get-user`
- Add `/api/cli/tools/get-cast`
- Add `/api/cli/tools/get-treasury-stats`
- Wire routes in server setup and add validation schemas
- Add and update tests for route behavior and registration
- Update architecture and API contract docs

## Constraints
- Reuse existing cache and rate-limit infra
- Do not log raw auth headers or tokens
- Keep behavior-compatible with existing tool semantics

## Plan
1. Implement route handlers and schemas.
2. Register routes behind route-level rate-limit prehandler.
3. Apply endpoint-specific caching behavior and cache-control headers.
4. Add/adjust tests for handlers and server route wiring.
5. Update docs and run required verification gates.

## Status
- Completed.
Status: completed
Updated: 2026-03-12
Completed: 2026-03-12
