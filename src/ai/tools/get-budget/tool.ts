import { registryBackedTool } from "../registry-backed-tool";
import type { Tool } from "../tool";

export const getBudgetTool = {
  name: "getBudget",
  prompt: async () => `### Get Budget Tool

Use this tool to inspect indexed budget state from the shared protocol database.
Pass a budget treasury address or recipient id.
The response is read-only and returns concise budget, parent goal, treasury, flow, and governance data.`,
  tool: registryBackedTool({
    registryName: "get-budget",
    description: "Inspect indexed budget state by budget address or recipient id",
  }),
} satisfies Tool;
