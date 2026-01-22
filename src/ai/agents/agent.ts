import type { LanguageModel, SystemModelMessage, ToolSet } from "ai";
import { CHAT_DEFAULT_FID } from "../../config/constants";
import type { Tool } from "../tools/tool";
import type { ChatData, ChatUser } from "../types";
import { getChatDefault } from "./chat-default/chat-default";

export type AgentType = "chat-default";

export type Agent = {
  system: SystemModelMessage[];
  tools: ToolSet;
  defaultModel: LanguageModel;
};

export async function getAgent(
  type: AgentType,
  user: ChatUser | null,
  data: ChatData,
  tools?: Tool[],
): Promise<Agent> {
  switch (type) {
    case "chat-default":
      return getChatDefault(user, data, tools);
    default:
      throw new Error(`Unsupported agent "${type}"`);
  }
}

export async function getAgentByFid(fid: number): Promise<Agent> {
  switch (fid) {
    case CHAT_DEFAULT_FID:
      return getAgent("chat-default", null, {});
    default:
      throw new Error(`Unsupported agent FID "${fid}"`);
  }
}

export const getRandomAgentFid = () => {
  const fids = [CHAT_DEFAULT_FID];
  return fids[Math.floor(Math.random() * fids.length)];
};
