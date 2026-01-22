import { castPreviewTool } from "./cast-preview/cast-preview";
import { cobuildAiContextTool } from "./cobuild-ai-context/tool";
import { docsFileSearchTool } from "./docs/docs";
import { getCastTool } from "./get-cast/get-cast";
import { getUserTool } from "./get-user/tool";
import type { Tool } from "./tool";
import { webSearchTool } from "./web-search/web-search";

export const defaultTools: Tool[] = [
  getUserTool,
  getCastTool,
  castPreviewTool,
  cobuildAiContextTool,
  ...(docsFileSearchTool ? [docsFileSearchTool] : []),
  webSearchTool,
];

export const toolsByName = Object.fromEntries(
  defaultTools.map((tool) => [tool.name, tool]),
) as Record<string, Tool>;
