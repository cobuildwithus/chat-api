import { openAIModel } from "../../ai";
import { defaultTools } from "../../tools";
import { type Tool, getTools } from "../../tools/tool";
import type { ChatData, ChatUser } from "../../types";
import { getAgentPrompts } from "../../utils/agent-prompts";
import type { Agent } from "../agent";
import { chatDefaultPersonalityPrompt } from "./personality";

export async function getChatDefault(
  user: ChatUser | null,
  data: ChatData = {},
  incomingTools: Tool[] = defaultTools,
): Promise<Agent> {
  // Make a fresh copy so we don't mutate the shared defaultTools array across requests
  const tools = [...incomingTools];
  return {
    system: await getAgentPrompts({
      user,
      data,
      tools,
      personality: chatDefaultPersonalityPrompt,
      extraPrompts: [],
    }),
    tools: getTools(tools),
    defaultModel: openAIModel,
  };
}
