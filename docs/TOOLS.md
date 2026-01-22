# Tools

Tools are registered statically in `src/ai/tools/index.ts`.
Each tool lives in its own folder with a `tool.ts` (and optionally a `prompt.ts`).

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

Add your tool to `src/ai/tools/index.ts` in the `defaultTools` array.
Keep the order stable unless behavior explicitly needs to change.

## Tests

Add tests under `tests/ai/tools/` or extend existing chat tests if the tool impacts agent behavior.
