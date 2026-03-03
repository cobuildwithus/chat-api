import { z } from "zod";
import { registryBackedTool } from "../registry-backed-tool";
import type { Tool } from "../tool";

export const getDiscussionThreadTool = {
  name: "getDiscussionThread",
  prompt: async () => `### Get Discussion Thread Tool

Use this tool to fetch one discussion thread by root cast hash.
- Use focusHash to navigate directly to a specific reply.
- Use page/pageSize for pagination.
`,
  tool: registryBackedTool({
    registryName: "get-discussion-thread",
    inputSchema: z.object({
      rootHash: z.string().describe("Root cast hash for the thread."),
      page: z.number().int().min(1).max(10_000).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      focusHash: z.string().optional().describe("Optional reply hash to center pagination around."),
    }),
    description: "Get one Cobuild discussion thread with paginated replies.",
  }),
} satisfies Tool;
