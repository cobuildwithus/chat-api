import { z } from "zod";
import { registryBackedTool } from "../registry-backed-tool";
import type { Tool } from "../tool";

export const getDisputeTool = {
  name: "getDispute",
  prompt: async () => `### Get Dispute Tool

Use this tool to inspect indexed arbitrator dispute state from the shared protocol database.
Pass the canonical composite dispute id from the indexer: <arbitrator>:<disputeId>.
Include juror only when you need one juror's dispute-specific receipt and membership details.`,
  tool: registryBackedTool({
    registryName: "get-dispute",
    inputSchema: z.object({
      identifier: z
        .string()
        .describe("Composite arbitrator dispute id: <arbitrator>:<disputeId>"),
      juror: z
        .string()
        .describe("Optional juror wallet address for per-juror dispute detail")
        .optional(),
    }),
    description: "Inspect indexed arbitrator dispute state by composite dispute identifier",
  }),
} satisfies Tool;
