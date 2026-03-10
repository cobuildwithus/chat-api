import { registryBackedTool } from "../registry-backed-tool";
import type { Tool } from "../tool";

export const getCastTool = {
  name: "getCast",
  prompt: async () => `### Get Cast Tool

  Use this tool to fetch one cast by hash from the Cobuild Farcaster database.
  Only full cast hashes are supported: 0x + 40 hex chars.
  URL lookups are deprecated and no longer supported.
`,
  tool: registryBackedTool({
    registryName: "get-cast",
    description: "Get cast details by hash",
  }),
} satisfies Tool;
