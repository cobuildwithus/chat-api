# 2026-02-25 Internal Key Rename

## Goal
Remove ambiguity between "buildbot key" and "chat internal key" by renaming the internal service env variable to `CHAT_INTERNAL_SERVICE_KEY` across chat-api.

## Scope
- Runtime config parsing and getter naming
- Internal auth middleware usage
- Tests and docs references

## Compatibility
- Keep backward-compatible fallback to `BUILD_BOT_TOOLS_INTERNAL_KEY` for this transition.
- Prefer `CHAT_INTERNAL_SERVICE_KEY` when both are set.

## Verification
- Run required checks: typecheck, test, coverage, docs drift, doc gardening.
