import { tool } from "ai";
import { z } from "zod";
import { executeTool } from "../../../api/tools/registry";
import type { Tool } from "../tool";

export const replyToCastTool = {
  name: "replyToCast",
  prompt: async () => `### Reply To Cast Tool

Use this tool only when the user explicitly wants to publish a Farcaster reply.
- Always confirm intent first.
- Set confirm=true only after explicit user approval.
- Requires a valid signerUuid and parentHash.
`,
  tool: tool({
    inputSchema: z.object({
      confirm: z.boolean().describe("Must be true to publish."),
      signerUuid: z.string().describe("Neynar signer UUID with cast permission."),
      text: z.string().min(1).max(1024).describe("Reply text."),
      parentHash: z.string().describe("Target parent cast hash."),
      parentAuthorFid: z.number().int().positive().optional(),
      idem: z.string().min(1).max(128).optional(),
      embeds: z.array(z.object({ url: z.string() })).max(2).optional(),
    }),
    description: "Publish a Farcaster reply to a specific cast hash via Neynar.",
    execute: async (input) => {
      const result = await executeTool("reply-to-cast", input);
      if (result.ok) {
        return result.output;
      }
      return { error: result.error };
    },
  }),
} satisfies Tool;
