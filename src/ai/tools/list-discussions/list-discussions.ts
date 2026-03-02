import { tool } from "ai";
import { z } from "zod";
import { executeTool } from "../../../api/tools/registry";
import type { Tool } from "../tool";

export const listDiscussionsTool = {
  name: "listDiscussions",
  prompt: async () => `### List Discussions Tool

Use this tool to list top-level Cobuild discussion posts.
- Use it when the user asks for recent discussions, most replied posts, or most viewed posts.
- For deep dives into one thread, call getDiscussionThread with the root hash returned here.
`,
  tool: tool({
    inputSchema: z
      .object({
        limit: z.number().int().min(1).max(50).optional(),
        offset: z.number().int().min(0).max(10_000).optional(),
        sort: z.enum(["last", "replies", "views"]).optional(),
        direction: z.enum(["asc", "desc"]).optional(),
      })
      .optional()
      .default({}),
    description: "List Cobuild discussion root posts with pagination and sorting.",
    execute: async (input) => {
      const result = await executeTool("list-discussions", input);
      if (result.ok) {
        return result.output;
      }
      return { error: result.error };
    },
  }),
} satisfies Tool;
