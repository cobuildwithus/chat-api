# Review GPT patch-file output

Status: in_progress
Created: 2026-03-13
Updated: 2026-03-30

## Goal

- Update every repo-local Review GPT prompt used by the chat-api repo so the model returns a downloadable `.patch` attachment instead of copy/paste-ready prompts for parallel fix agents.

## Scope

- `scripts/chatgpt-review-presets/*.md`
- `agent-docs/prompts/*.md`
- `agent-docs/index.md`

## Constraints

- Keep the change docs-only and avoid runtime source files.
- Preserve the current prompt intent and only replace the response-format requirement.
- Keep the docs index aligned with the changed prompt docs.

## Tasks

1. Replace the parallel-agent output instruction in each Review GPT prompt markdown file with the patch-file output instruction.
2. Update `agent-docs/index.md` to reflect the prompt revision.
3. Update this active plan so docs-drift checks treat the multi-file prompt sweep as tracked work.
4. Run the required docs-only verification commands before handoff.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `bash scripts/check-agent-docs-drift.sh`
- `bash scripts/doc-gardening.sh --fail-on-issues`
