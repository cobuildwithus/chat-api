import type { UIMessage } from "ai";
import type { AgentType } from "./agents/agent";

export type ChatAttachment =
  | {
      type: "file";
      url: string;
      mediaType: string;
      filename?: string;
      mimeType?: string;
      name?: string;
    }
  | {
      type: "image";
      image: string;
      mimeType?: string;
    };

export type ChatBody = {
  chatId: string;
  clientMessageId: string;
  userMessage: string;
  attachments?: ChatAttachment[];
  context?: string;
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
