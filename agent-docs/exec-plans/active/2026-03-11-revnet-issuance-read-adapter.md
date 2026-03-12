# Revnet Issuance Read Adapter

## Goal

Add a canonical indexed `get-revnet-issuance-terms` tool in `chat-api` and reuse the same wire-backed issuance summary logic in `get-treasury-stats`.

## Scope

- Surface indexed ruleset fields needed by `@cobuild/wire` issuance helpers.
- Add a dedicated revnet issuance read service.
- Register a canonical read-only tool for issuance terms.
- Replace `cobuild-ai-context` issuance drift logic with the shared service/helper output.
- Update regression tests and tool docs.

## Constraints

- Keep `chat-api` as the indexed read adapter only; no wallet execution here.
- Reuse `@cobuild/wire` for issuance transforms instead of maintaining local duplicate math.
- Preserve the existing `get-treasury-stats` tool contract while improving issuance accuracy.

## Verification

- `pnpm wire:use-local` if needed during development
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`

## Notes

- If local-wire development is required, restore the published dependency flow before close-out.
