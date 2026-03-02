import { tool } from "ai";
import { z } from "zod";
import { executeTool } from "../../../api/tools/registry";
import type { Tool } from "../tool";

export const cobuildAiContextTool = {
  name: "get-treasury-stats",
  prompt: async () => `### Treasury Stats Tool

Use this tool to fetch the latest treasury stats snapshot.
- Use it when you need the most up-to-date treasury, issuance, mints, holders, or distribution data.
- The response mirrors the latest treasury stats snapshot payload.
- Prefer the built-in snapshot prompt unless the user asks for the latest data.`,
  tool: tool({
    inputSchema: z.object({}),
    description: "Fetch the latest treasury stats snapshot.",
    execute: async () => {
      const result = await executeTool("get-treasury-stats", {});
      if (result.ok) {
        return result.output;
      }
      return { error: result.error };
    },
  }),
} satisfies Tool;
