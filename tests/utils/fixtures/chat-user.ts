import type { ChatUser } from "../../../src/ai/types";

export const buildChatUser = (overrides: Partial<ChatUser> = {}): ChatUser => ({
  address: "0xabc0000000000000000000000000000000000000",
  city: null,
  country: null,
  countryRegion: null,
  userAgent: null,
  ...overrides,
});
