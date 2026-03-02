import { tool } from "ai";
import { z } from "zod";
import { executeTool } from "../../../api/tools/registry";
import type { Tool } from "../tool";

export const getDiscussionThreadTool = {
  name: "getDiscussionThread",
  prompt: async () => `### Get Discussion Thread Tool

Use this tool to fetch one discussion thread by root cast hash.
- Use focusHash to navigate directly to a specific reply.
- Use page/pageSize for pagination.
`,
  tool: tool({
    inputSchema: z.object({
      rootHash: z.string().describe("Root cast hash for the thread."),
      page: z.number().int().min(1).max(10_000).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      focusHash: z.string().optional().describe("Optional reply hash to center pagination around."),
    }),
    description: "Get one Cobuild discussion thread with paginated replies.",
    execute: async (input) => {
      const result = await executeTool("get-discussion-thread", input);
      if (result.ok) {
        return result.output;
      }
      return { error: result.error };
    },
  }),
} satisfies Tool;
