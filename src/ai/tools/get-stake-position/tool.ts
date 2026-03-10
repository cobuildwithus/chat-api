import { z } from "zod";
import { registryBackedTool } from "../registry-backed-tool";
import type { Tool } from "../tool";

export const getStakePositionTool = {
  name: "getStakePosition",
  prompt: async () => `### Get Stake Position Tool

Use this tool to inspect indexed stake-vault account state from the shared protocol database.
Pass a goal, budget, or stake-vault identifier plus the account address to inspect.
The response is read-only and returns compact vault totals, account stake balances, and juror state when present.`,
  tool: registryBackedTool({
    registryName: "get-stake-position",
    inputSchema: z.object({
      identifier: z
        .string()
        .describe("Goal route/address, budget address/recipient id, or stake-vault address"),
      account: z.string().describe("Wallet address to inspect inside the resolved stake vault"),
    }),
    description: "Inspect indexed stake-vault account state by entity or stake-vault identifier",
  }),
} satisfies Tool;
