import { describe, expect, it } from "vitest";
import { aboutPrompt } from "../../../src/ai/prompts/about";
import { manifestoPrompt } from "../../../src/ai/prompts/manifesto";
import { billOfRightsPrompt } from "../../../src/ai/prompts/bill-of-rights";

const expectContains = async (promise: Promise<string>, fragment: string) => {
  const value = await promise;
  expect(value).toContain(fragment);
};

describe("base prompts", () => {
  it("returns about, manifesto, and bill of rights prompts", async () => {
    await expectContains(aboutPrompt(), "# About");
    await expectContains(manifestoPrompt(), "# A Cobuilder's Manifesto");
    await expectContains(billOfRightsPrompt(), "# The Cobuild Bill of Rights");
  });
});
