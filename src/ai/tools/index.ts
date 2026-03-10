import { docsFileSearchTool } from "./docs/docs";
import { cobuildAiContextTool } from "./cobuild-ai-context/tool";
import { getBudgetTool } from "./get-budget/tool";
import { getDisputeTool } from "./get-dispute/tool";
import { getDiscussionThreadTool } from "./get-discussion-thread/get-discussion-thread";
import { getCastTool } from "./get-cast/get-cast";
import { getGoalTool } from "./get-goal/tool";
import { getPremiumEscrowTool } from "./get-premium-escrow/tool";
import { getStakePositionTool } from "./get-stake-position/tool";
import { getTcrRequestTool } from "./get-tcr-request/tool";
import { getUserTool } from "./get-user/tool";
import { listDiscussionsTool } from "./list-discussions/list-discussions";
import { semanticSearchCastsTool } from "./semantic-search-casts/semantic-search-casts";
import type { Tool } from "./tool";
import { webSearchTool } from "./web-search/web-search";

export const defaultTools: Tool[] = [
  getUserTool,
  getGoalTool,
  getBudgetTool,
  getTcrRequestTool,
  getDisputeTool,
  getStakePositionTool,
  getPremiumEscrowTool,
  getCastTool,
  listDiscussionsTool,
  getDiscussionThreadTool,
  semanticSearchCastsTool,
  cobuildAiContextTool,
  ...(docsFileSearchTool ? [docsFileSearchTool] : []),
  webSearchTool,
];

export const toolsByName = Object.fromEntries(
  defaultTools.map((tool) => [tool.name, tool]),
) as Record<string, Tool>;
