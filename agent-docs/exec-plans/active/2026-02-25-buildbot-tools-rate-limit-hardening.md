# CLI Tools Rate-Limit Hardening (2026-02-25)

## Goal
Fix high-severity cli tools limiter issues so rate limiting is enforceable and not trivially bypassed.

## Scope
- Correct usage event recording so repeated requests accumulate reliably.
- Remove untrusted bearer token keying from route-local limiter.
- Improve route-level limiter behavior and add regression tests.

## Constraints
- Preserve existing tool route request/response contracts.
- Keep sensitive token values out of keys, logs, and tests.
- Reuse existing Redis rate-limit infrastructure where possible.

## Plan
1. Patch rate-limit storage encoding to avoid ZSET member collisions.
2. Patch cli tools limiter keying and retry handling internals.
3. Add regression tests for keying and usage-event encoding.
4. Run completion workflow audits and required verification gates.

## Status
- Completed.
