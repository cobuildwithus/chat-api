# Tools

Canonical REST tools are implemented in `src/tools/registry.ts`.
Model-invokable AI wrappers are registered statically in `src/ai/tools/index.ts`.
Each AI wrapper lives in its own folder with a `tool.ts` (and optionally a `prompt.ts`).
See [README.md](../README.md) for setup and [ARCHITECTURE.md](../ARCHITECTURE.md) for the module map.

## When to add a tool

- You need data that is outside the chat DB or must be fetched live.
- You need a reusable action that should be invoked by the model.

## Tool folder template

```
src/ai/tools/<tool-name>/
  tool.ts          # exports a Tool object
  prompt.ts        # optional, helper for prompt text
```

## Required shape

```ts
import { tool } from "ai";
import type { Tool } from "../tool";

export const myTool = {
  name: "myTool",
  prompt: async () => "...",
  tool: tool({
    inputSchema: ..., // zod schema
    description: "...",
    execute: async (input) => { ... }
  }),
} satisfies Tool;
```

## Registering a tool

Register the canonical tool in `src/tools/registry.ts`, then add an AI wrapper in `src/ai/tools/index.ts` if the model should invoke it directly.
Keep the order stable unless behavior explicitly needs to change.
For registry-backed AI tools, reuse the canonical registry validator as the wrapper `inputSchema` instead of defining a second schema in `src/ai/tools/**`.

Example canonical-only CLI tool:
- `get-wallet-balances` (aliases: `getWalletBalances`, `walletBalances`) is exposed via `/v1/tool-executions` for CLI balance reads and is not registered as a model wrapper.
- `get-wallet-balances` currently supports `base` only for protocol-adjacent wallet reads.
- `list-wallet-notifications` (aliases: `listWalletNotifications`, `walletNotifications`) is exposed via `/v1/tool-executions` for subject-wallet inbox reads and is not registered as a model wrapper.
- `list-wallet-notifications` returns shaped public payload DTOs only: discussion payloads are omitted, payment payloads expose the allowlisted payment fields, and protocol payloads are parsed through the shared wire notification DTO.

Example canonical + AI-wrapper inspect tools:
- `get-goal` (aliases: `getGoal`, `goal.inspect`) reads indexed scaffold tables directly and returns concise goal, treasury, route, flow, stake, governance, and budget summary data.
- `get-goal` returns a stable `409` error when a canonical route identifier matches more than one indexed goal; callers should retry with the goal treasury address.
- `get-budget` (aliases: `getBudget`, `budget.inspect`) reads indexed scaffold tables directly and returns concise budget, parent-goal, treasury, flow, and governance data.
- `get-tcr-request` (aliases: `getTcrRequest`, `tcr.request`) reads indexed protocol tables directly and returns concise TCR request, dispute, goal, and budget context by composite request id.
- `get-dispute` (aliases: `getDispute`, `dispute.inspect`) reads indexed protocol tables directly and returns concise arbitrator dispute state, request context, and optional juror detail by composite dispute id.
- `get-stake-position` (aliases: `getStakePosition`, `stake.inspect`) reads indexed protocol tables directly and returns compact stake-vault totals plus goal/cobuild account state for a resolved entity or vault.
- `get-stake-position` returns a stable `409` error when a goal route identifier is ambiguous; callers should retry with the goal treasury, budget treasury, or stake-vault address.
- `get-premium-escrow` (aliases: `getPremiumEscrow`, `premiumEscrow.inspect`) reads indexed protocol tables directly and returns compact premium escrow, budget stack, and optional account checkpoint state.

## Prompt guidance

- Keep prompts concise and action-oriented.
- Explicitly state when to use the tool and when not to.
- Avoid leaking internal system details or secrets in prompts.

## Tests

Add tests under `tests/ai/tools/` or extend existing chat tests if the tool impacts agent behavior.
