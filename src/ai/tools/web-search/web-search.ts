import { openAIProvider } from "../../ai";
import type { Tool } from "../tool";

export const webSearchTool = {
  name: "web_search",
  prompt: async () => `### Web Search Tool

Use this tool to look up recent or niche information on the public web.
- Prefer it for up-to-date facts, current events, prices, schedules, or when the user asks for sources.
- Summarize results in your own words and include citations or URLs for key claims.
- Do not use it for private data or to access restricted content.`,
  tool: openAIProvider.tools.webSearch(),
} satisfies Tool;
