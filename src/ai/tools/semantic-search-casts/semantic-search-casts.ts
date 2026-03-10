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
    description: "Semantic search over Cobuild discussion casts using stored embeddings.",
  }),
} satisfies Tool;
