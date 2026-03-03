import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  chat,
  chatMessage,
  cliOauthCodes,
  cliSessions,
  farcasterProfiles,
} from "../../../src/infra/db/schema";

describe("db schema", () => {
  it("exports core tables", () => {
    expect(chat).toBeDefined();
    expect(chatMessage).toBeDefined();
    expect(farcasterProfiles).toBeDefined();
    expect(cliOauthCodes).toBeDefined();
    expect(cliSessions).toBeDefined();
  });

  it("registers expected indexes and constraints", () => {
    const chatMessageConfig = getTableConfig(chatMessage);
    expect(chatMessageConfig.indexes).toHaveLength(1);

    const oauthCodesConfig = getTableConfig(cliOauthCodes);
    expect(oauthCodesConfig.indexes).toHaveLength(2);

    const cliSessionsConfig = getTableConfig(cliSessions);
    expect(cliSessionsConfig.indexes).toHaveLength(3);
  });
});
