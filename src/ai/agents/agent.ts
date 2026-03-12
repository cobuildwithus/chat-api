import type { LanguageModel, SystemModelMessage, ToolSet } from "ai";
import type { Tool } from "../tools/tool";
import type { ChatData, ChatUser } from "../types";
import { getChatDefault } from "./chat-default/chat-default";

export type Agent = {
  system: SystemModelMessage[];
  tools: ToolSet;
  defaultModel: LanguageModel;
};

export async function getAgent(
  user: ChatUser | null,
  data: ChatData,
  tools?: Tool[],
): Promise<Agent> {
  return getChatDefault(user, data, tools);
}
