# Completion Workflow

Last verified: 2026-03-30

## Sequence

1. Complete functional implementation first.
2. Run simplification pass using `agent-docs/prompts/simplify.md`. Expect about 5 to 10 minutes on non-trivial diffs; do not rush it or cancel it early just because it has not answered in the first minute.
3. Apply behavior-preserving simplifications.
4. Re-run required checks after simplify updates.
5. Run final completion audit using `agent-docs/prompts/task-finish-review.md`. Expect about 5 to 10 minutes on non-trivial diffs; do not rush it or cancel it early just because it has not answered in the first minute.
6. Treat the final completion audit as the remaining coverage/proof-gap review too. If it finds meaningful missing tests or boundary-level verification, add the smallest high-impact proof before handoff instead of creating a separate coverage-audit pass.
7. Resolve high-severity findings before final handoff and re-run affected required checks after any post-review fixes.
8. Final handoff must report required-check results; green required checks remain the default completion bar.
9. If a required check fails for a credibly unrelated pre-existing reason, commit your exact touched files and hand off with the failing command, failing target, and why your diff did not cause it. If you cannot defend that separation, treat the failure as blocking.

## Coordination Ledger (Always Required)

- Before coding work, add an active row to `agent-docs/exec-plans/active/COORDINATION_LEDGER.md`.
- Treat the row as an active-work notice by default, not a hard lock.
- Overlap is allowed when agents stay within their declared scope, read the current file state first, and preserve adjacent edits.
- Mark a row as exclusive in `Dependency Notes` only when overlap is unsafe, such as a broad refactor or a delicate cross-cutting rewrite.
- Update the row if file scope, symbol intent, or exclusivity expectations change.
- Remove the row immediately when the task is complete or abandoned.

## Audit Handoff Packet

When using a fresh subagent for the final completion audit, provide:

- What changed and why (behavior-level summary).
- Invariants/assumptions that must still hold.
- Links to active execution plans (when present).
- Verification evidence already run (commands + outcomes).
- Any direct scenario proof already run, or the gap if it still needs human verification.
- Current worktree context and explicit review boundaries.
- Instruction to read `COORDINATION_LEDGER.md`, honor any explicit exclusive/refactor notes, and otherwise work carefully on top of overlapping rows.

## Audit Patience

- Prefer a patient wait window over repeated short polling for simplify and final-review subagents.
- A realistic default is 5 to 10 minutes for each audit pass on medium or large diffs.
- Do not cancel or close an audit subagent early just because it has been running for under 10 minutes unless you have concrete evidence that it is stuck or operating on the wrong scope.

## Safety Rules

- Do not overwrite, discard, or revert unrelated worktree edits.
- Do not use reset/checkout cleanup commands to prepare audit passes.
- If an audit suggestion conflicts with pre-existing edits, leave the file untouched and escalate in handoff notes.
