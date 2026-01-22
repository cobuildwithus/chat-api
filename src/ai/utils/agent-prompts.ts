import type { SystemModelMessage } from "ai";
import { aboutPrompt } from "../prompts/about";
import { billOfRightsPrompt } from "../prompts/bill-of-rights";
import { cobuildAiContextPrompt } from "../prompts/cobuild-ai-context";
import { manifestoPrompt } from "../prompts/manifesto";
import { getGoalPrompt } from "../prompts/goal";
import { getUserDataPrompt } from "../prompts/user-data";
import { Tool, cachedPrompts, getToolPrompts } from "../tools/tool";
import type { ChatData, ChatUser } from "../types";

interface Props {
  personality: string;
  user: ChatUser | null;
  data: ChatData;
  tools: Tool[];
  extraPrompts: string[];
}

export async function getAgentPrompts(props: Props): Promise<SystemModelMessage[]> {
  const { personality, user, data, tools, extraPrompts } = props;
  const prompts: SystemModelMessage[] = [];

  // Add cached prompts
  prompts.push(
    ...cachedPrompts([
      { role: "system", content: await aboutPrompt() },
      { role: "system", content: await manifestoPrompt() },
      { role: "system", content: await billOfRightsPrompt() },
      { role: "system", content: personality },
      ...(await getToolPrompts(tools)),
    ]),
  );

  // Non-cached prompts
  const goalPrompt = await getGoalPrompt(data?.goalAddress);
  if (goalPrompt) prompts.push({ role: "system", content: goalPrompt });
  prompts.push({ role: "system", content: await cobuildAiContextPrompt() });
  prompts.push({ role: "system", content: getDataPrompt(data) });
  if (user) prompts.push({ role: "system", content: await getUserDataPrompt(user) });

  // Agent-specific prompts
  prompts.push(...extraPrompts.map((t) => ({ role: "system" as const, content: t })));

  return prompts.filter((prompt) => prompt.content.length > 0);
}

function getDataPrompt(data: ChatData) {
  if (!data || Object.keys(data).length === 0) return "";
  const hiddenKeys = new Set([
    "grantId",
    "impactId",
    "opportunityId",
    "startupId",
    "draftId",
  ]);
  const safeEntries = Object.entries(data).filter(([key]) => !hiddenKeys.has(key));
  if (safeEntries.length === 0) return "";
  return `\n\n# Additional data:\n${JSON.stringify(Object.fromEntries(safeEntries))}`;
}
