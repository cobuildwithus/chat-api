# Tools

Canonical REST tools are registered in `src/api/tools/registry.ts`.
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

Register the canonical tool in `src/api/tools/registry.ts`, then add an AI wrapper in `src/ai/tools/index.ts` if the model should invoke it directly.
Keep the order stable unless behavior explicitly needs to change.

Example canonical-only CLI tool:
- `get-wallet-balances` (aliases: `getWalletBalances`, `walletBalances`) is exposed via `/v1/tool-executions` for CLI balance reads and is not registered as a model wrapper.

## Prompt guidance

- Keep prompts concise and action-oriented.
- Explicitly state when to use the tool and when not to.
- Avoid leaking internal system details or secrets in prompts.

## Tests

Add tests under `tests/ai/tools/` or extend existing chat tests if the tool impacts agent behavior.
