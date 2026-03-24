# Wire ABI sync

## Goal

Consume the published `@cobuild/wire@0.3.5` package in `chat-api` and verify the shared contract/helper surface still typechecks and tests cleanly.

## Constraints

- Prefer a dependency-only change unless verification proves otherwise.
- Keep the repo on a published `wire` spec, not a local link.

## Scope

- Bump `@cobuild/wire` to `0.3.5`.
- Run the required verification suite and only patch code if the new published surface forces it.

## Verification

- `pnpm verify`
