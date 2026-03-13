# Review GPT parallel-agent output

Status: in_progress
Created: 2026-03-13
Updated: 2026-03-13

## Goal

- Update every repo-local Review GPT prompt used by the chat-api repo so the model returns copy/paste-ready prompts for parallel fix agents, with detailed issue context and a best-guess remediation path.

## Scope

- `scripts/chatgpt-review-presets/*.md`
- `agent-docs/prompts/*.md`
- `agent-docs/index.md`

## Constraints

- Keep the change docs-only and avoid runtime source files.
- Preserve the current prompt intent and only append the new response-format requirement.
- Keep the docs index aligned with the changed prompt docs.

## Tasks

1. Append the parallel-agent output instruction to each Review GPT prompt markdown file.
2. Update `agent-docs/index.md` to reflect the prompt revision.
3. Run the required docs-only verification commands before handoff.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
