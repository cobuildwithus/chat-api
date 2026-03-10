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
    description: "Get one Cobuild discussion thread with paginated replies.",
  }),
} satisfies Tool;
