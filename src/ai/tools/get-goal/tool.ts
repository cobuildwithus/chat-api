import { z } from "zod";
import { registryBackedTool } from "../registry-backed-tool";
import type { Tool } from "../tool";

export const getGoalTool = {
  name: "getGoal",
  prompt: async () => `### Get Goal Tool

Use this tool to inspect indexed goal state from the shared protocol database.
Pass a goal treasury address, canonical route slug, or canonical route domain.
The response is read-only and returns concise goal, treasury, route, flow, stake, governance, and budget summary data.`,
  tool: registryBackedTool({
    registryName: "get-goal",
    inputSchema: z.object({
      identifier: z
        .string()
        .describe("Goal treasury address, canonical route slug, or canonical route domain"),
    }),
    description: "Inspect indexed goal state by goal address or canonical route identifier",
  }),
} satisfies Tool;
