import { tool } from "ai";
import { z } from "zod";
import type { Tool } from "../tool";

export const castPreviewTool = {
  name: "castPreview",
  prompt: async () => `### Cast Preview tool

  You can call this tool with the cast data - it will generate a preview of the cast with approval button for the user.
  
  Before calling this tool, you should have already collected the information from the user and generated the cast content.

  Important: If the user provided images/videos embeds, you should show them in the cast preview unless the user has provided a reason not to.
  A maximum of two images or videos are allowed to be posted in a cast. 
  If the user provides more than two, you should ask them to select the most relevant ones.
  You can add one image and one video, or two images, or two videos. No more than two of either.
  
  User will see the "Publish" button near the cast preview.
`,
  tool: tool({
    inputSchema: z.object({
      text: z.string().describe("Cast's text"),
      embeds: z.array(z.object({ url: z.string() })).optional(),
      parent: z.string().optional(), // parent_url of the channel the cast is in, or hash of the cast
    }),
    description: "Show the cast preview to the user",
    execute: async (cast) => cast,
  }),
} satisfies Tool;
