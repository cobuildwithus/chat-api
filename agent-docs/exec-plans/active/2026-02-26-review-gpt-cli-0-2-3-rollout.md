# 2026-02-26 Review GPT CLI 0.2.3 Rollout

## Goal
Upgrade chat-api's shared review launcher dependency to `@cobuild/review-gpt@^0.2.3` and preserve existing `pnpm run review:gpt -- ...` invocation ergonomics.

## Scope
- Bump `@cobuild/review-gpt` in `package.json` and `pnpm-lock.yaml`.
- Keep the wrapper thin and add a leading `--` passthrough guard in `scripts/chatgpt-oracle-review.sh`.

## Constraints
- No behavioral changes to API runtime paths.
- Keep `review:gpt` command shape stable for existing operator workflows.

## Plan
1. Upgrade dependency and lockfile to `0.2.3`.
2. Add wrapper guard to drop a literal leading `--` arg.
3. Run required checks (`typecheck`, `test`, `test:coverage`, `docs:drift`, `docs:gardening`).

## Status
- In progress.
