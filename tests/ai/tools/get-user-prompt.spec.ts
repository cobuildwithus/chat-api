import { describe, expect, it } from "vitest";
import { getUserPrompt } from "../../../src/ai/tools/get-user/get-user-prompt";

describe("getUserPrompt", () => {
  it("returns guidance for getUser tool", async () => {
    const prompt = await getUserPrompt();
    expect(prompt).toContain("getUser");
    expect(prompt).toContain("Farcaster");
  });
});
