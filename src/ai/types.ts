import type { UIMessage } from "ai";
import type { AgentType } from "./agents/agent";

export type ChatBody = {
  id: string;
  messages: Array<UIMessage>;
  type: AgentType;
  data?: ChatData;
  context?: string;
  clientMessageId?: string;
};

export type ChatData = {
  goalAddress?: string;
  grantId?: string;
  impactId?: string;
  castId?: string;
  opportunityId?: string;
  startupId?: string;
  draftId?: string;
};

export type ChatUser = {
  address: string;
  country: string | null;
  countryRegion: string | null;
  city: string | null;
  userAgent: string | null;
};
