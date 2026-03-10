import { registryBackedTool } from "../registry-backed-tool";
import type { Tool } from "../tool";

export const listDiscussionsTool = {
  name: "listDiscussions",
  prompt: async () => `### List Discussions Tool

Use this tool to list top-level Cobuild discussion posts.
- Use it when the user asks for recent discussions, most replied posts, or most viewed posts.
- For deep dives into one thread, call getDiscussionThread with the root hash returned here.
`,
  tool: registryBackedTool({
    registryName: "list-discussions",
    description: "List Cobuild discussion root posts with pagination and sorting.",
  }),
} satisfies Tool;
