import { tool } from "ai";
import { z } from "zod";
import { executeTool } from "../../../api/tools/registry";
import type { Tool } from "../tool";

export const semanticSearchCastsTool = {
  name: "semanticSearchCasts",
  prompt: async () => `### Semantic Search Casts Tool

Use this tool to semantically search Cobuild discussion casts.
- Prefer this when keyword search is weak or the user asks for conceptually similar posts.
- Returned hashes can be passed to getDiscussionThread (focusHash) for navigation.
`,
  tool: tool({
    inputSchema: z.object({
      query: z.string().min(1).describe("Natural-language query for semantic matching."),
      limit: z.number().int().min(1).max(25).optional(),
      rootHash: z.string().optional().describe("Optional root cast hash to scope search to one thread."),
    }),
    description: "Semantic search over Cobuild discussion casts using stored embeddings.",
    execute: async (input) => {
      const result = await executeTool("semantic-search-casts", input);
      if (result.ok) {
        return result.output;
      }
      return { error: result.error };
    },
  }),
} satisfies Tool;
