import { tool } from "ai";
import { z } from "zod";
import { neynarClientNotifications as neynarClient } from "../../../infra/neynar/client";
import type { Tool } from "../tool";

export const getCastTool = {
  name: "getCast",
  prompt: async () => `### Get Cast Tool

  You can use this tool to get cast by hash or URL.
  Casts are either in the format of a hash or a URL.
  If the cast is a URL, it will look like this: https://warpcast.com/username/0xhash
  If the cast is a hash, it will look like this: 0xhash
`,
  tool: tool({
    inputSchema: z.object({
      identifier: z.string().describe("Cast hash or Warpcast URL"),
      type: z.enum(["hash", "url"]).describe("Type of the identifier - hash or URL"),
    }),
    description: "Get cast details by hash or URL",
    execute: async ({ identifier, type }) => {
      console.debug(`Getting cast ${identifier} with type ${type}`);
      return await getCast(identifier, type);
    },
  }),
} satisfies Tool;

async function getCast(identifier: string, type: "hash" | "url") {
  try {
    const response = await neynarClient.lookupCastByHashOrUrl({ identifier, type });
    return response.cast;
  } catch (error) {
    console.error("Error getting cast", error);
    return null;
  }
}
