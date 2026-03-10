import { registryBackedTool } from "../registry-backed-tool";
import type { Tool } from "../tool";

export const getTcrRequestTool = {
  name: "getTcrRequest",
  prompt: async () => `### Get TCR Request Tool

Use this tool to inspect indexed TCR request state from the shared protocol database.
Pass the canonical composite request id from the indexer: <tcrAddress>:<itemId>:<requestIndex>.
The response is read-only and returns concise request, dispute, goal, and budget context.`,
  tool: registryBackedTool({
    registryName: "get-tcr-request",
    description: "Inspect indexed TCR request state by composite request identifier",
  }),
} satisfies Tool;
