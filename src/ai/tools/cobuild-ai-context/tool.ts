import { registryBackedTool } from "../registry-backed-tool";
import type { Tool } from "../tool";

export const cobuildAiContextTool = {
  name: "get-treasury-stats",
  prompt: async () => `### Treasury Stats Tool

Use this tool to fetch the latest treasury stats snapshot.
- Use it when you need the most up-to-date treasury, issuance, mints, holders, or distribution data.
- The response mirrors the latest treasury stats snapshot payload.
- Prefer the built-in snapshot prompt unless the user asks for the latest data.`,
  tool: registryBackedTool({
    registryName: "get-treasury-stats",
    description: "Fetch the latest treasury stats snapshot.",
  }),
} satisfies Tool;
