import { tool } from "ai";
import { z } from "zod";
import {
  COBUILD_AI_CONTEXT_URL,
  fetchCobuildAiContextFresh,
  formatCobuildAiContextError,
} from "../../../infra/cobuild-ai-context";
import type { Tool } from "../tool";

export const cobuildAiContextTool = {
  name: "getCobuildAiContext",
  prompt: async () => `### Cobuild Live Stats Tool

Use this tool to fetch the latest Cobuild live stats snapshot from co.build.
- Use it when you need the most up-to-date treasury, issuance, mints, holders, or distribution data.
- The response mirrors ${COBUILD_AI_CONTEXT_URL}.
- Prefer the built-in snapshot prompt unless the user asks for the latest data.`,
  tool: tool({
    inputSchema: z.object({}),
    description: "Fetch the latest Cobuild live stats snapshot from co.build.",
    execute: async () => {
      try {
        return await fetchCobuildAiContextFresh();
      } catch (error) {
        return { error: formatCobuildAiContextError(error) };
      }
    },
  }),
} satisfies Tool;
