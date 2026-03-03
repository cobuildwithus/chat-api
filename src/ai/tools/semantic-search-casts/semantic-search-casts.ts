import { z } from "zod";
import { registryBackedTool } from "../registry-backed-tool";
import type { Tool } from "../tool";

export const semanticSearchCastsTool = {
  name: "semanticSearchCasts",
  prompt: async () => `### Semantic Search Casts Tool

Use this tool to semantically search Cobuild discussion casts.
- Prefer this when keyword search is weak or the user asks for conceptually similar posts.
- Returned hashes can be passed to getDiscussionThread (focusHash) for navigation.
`,
  tool: registryBackedTool({
    registryName: "semantic-search-casts",
    inputSchema: z.object({
      query: z.string().min(1).describe("Natural-language query for semantic matching."),
      limit: z.number().int().min(1).max(25).optional(),
      rootHash: z.string().optional().describe("Optional root cast hash to scope search to one thread."),
    }),
    description: "Semantic search over Cobuild discussion casts using stored embeddings.",
  }),
} satisfies Tool;
