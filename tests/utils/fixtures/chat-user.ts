import type { ChatUserPrincipal } from "../../../src/api/auth/principals";

export const buildChatUser = (
  overrides: Partial<ChatUserPrincipal> = {},
): ChatUserPrincipal => ({
  address: "0xabc0000000000000000000000000000000000000",
  city: null,
  country: null,
  countryRegion: null,
  userAgent: null,
  ...overrides,
});
