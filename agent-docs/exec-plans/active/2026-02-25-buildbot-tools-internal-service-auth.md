# Buildbot Tools Internal Service Auth (2026-02-25)

## Goal
Restrict `/api/buildbot/tools/*` routes to internal callers that present a shared service header, without changing successful response contracts.

## Scope
- Add internal auth prehandler for all buildbot tool routes.
- Add `BUILD_BOT_TOOLS_INTERNAL_KEY` env support with helper getter.
- Enforce production env validation for internal key configuration.
- Wire prehandler order as internal-auth first, then route-local rate limiting.
- Add tests for auth prehandler behavior, route wiring order, and env behavior.
- Update architecture/security/behavior/contracts docs for the new boundary.

## Constraints
- Keep existing route request and success/error payload semantics unchanged except auth failures (`401`/`503`).
- Avoid exposing internal key values in logs or test fixtures.
- Respect active coordination ledger ownership boundaries.

## Plan
1. Add env schema/getter/validation changes for internal key support.
2. Implement buildbot tools internal auth prehandler in route module.
3. Wire all four buildbot routes to `[internal auth, rate limit]`.
4. Add regression tests for prehandler outcomes and route prehandler ordering.
5. Update required docs and run completion workflow + required checks.

## Status
- Completed.
