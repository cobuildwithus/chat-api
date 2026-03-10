import { registryBackedTool } from "../registry-backed-tool";
import type { Tool } from "../tool";

export const getPremiumEscrowTool = {
  name: "getPremiumEscrow",
  prompt: async () => `### Get Premium Escrow Tool

Use this tool to inspect indexed premium escrow state from the shared protocol database.
Pass a premium escrow address, budget treasury address, or budget stack id.
Include account only when you need one underwriter's escrow checkpoint and slash state.`,
  tool: registryBackedTool({
    registryName: "get-premium-escrow",
    description: "Inspect indexed premium escrow state by escrow, budget treasury, or budget stack identifier",
  }),
} satisfies Tool;
