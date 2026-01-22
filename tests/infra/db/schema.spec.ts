import { describe, expect, it } from "vitest";
import { chat, chatMessage, farcasterProfiles } from "../../../src/infra/db/schema";

describe("db schema", () => {
  it("exports core tables", () => {
    expect(chat).toBeDefined();
    expect(chatMessage).toBeDefined();
    expect(farcasterProfiles).toBeDefined();
  });
});
