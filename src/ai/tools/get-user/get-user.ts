import { tool } from "ai";
import { z } from "zod";
import { executeTool } from "../../../api/tools/registry";

export const getUser = tool({
  inputSchema: z.object({ fname: z.string() }),
  description:
    "Get user details including FID and verified addresses for a given Farcaster profile given their fname (username)",
  execute: async ({ fname }: { fname: string }) => {
    const result = await executeTool("get-user", { fname });
    if (result.ok) {
      return result.output;
    }
    return { error: result.error };
  },
});
