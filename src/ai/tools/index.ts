import { docsFileSearchTool } from "./docs/docs";
import { cobuildAiContextTool } from "./cobuild-ai-context/tool";
import { getDiscussionThreadTool } from "./get-discussion-thread/get-discussion-thread";
import { getCastTool } from "./get-cast/get-cast";
import { getUserTool } from "./get-user/tool";
import { listDiscussionsTool } from "./list-discussions/list-discussions";
import { replyToCastTool } from "./reply-to-cast/reply-to-cast";
import { semanticSearchCastsTool } from "./semantic-search-casts/semantic-search-casts";
import type { Tool } from "./tool";
import { webSearchTool } from "./web-search/web-search";

export const defaultTools: Tool[] = [
  getUserTool,
  getCastTool,
  listDiscussionsTool,
  getDiscussionThreadTool,
  semanticSearchCastsTool,
  replyToCastTool,
  cobuildAiContextTool,
  ...(docsFileSearchTool ? [docsFileSearchTool] : []),
  webSearchTool,
];

export const toolsByName = Object.fromEntries(
  defaultTools.map((tool) => [tool.name, tool]),
) as Record<string, Tool>;
