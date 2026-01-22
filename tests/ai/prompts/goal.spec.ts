import { describe, expect, it } from "vitest";
import { getGoalPrompt } from "../../../src/ai/prompts/goal";

const LOWER = "raise-1-mil";

describe("getGoalPrompt", () => {
  it("returns empty string when goal is missing or unknown", async () => {
    expect(await getGoalPrompt(undefined)).toBe("");
    expect(await getGoalPrompt("unknown")).toBe("");
  });

  it("returns formatted prompt when goal exists", async () => {
    const prompt = await getGoalPrompt(LOWER.toUpperCase());
    expect(prompt).toContain("# Goal context");
    expect(prompt).toContain("Raise $1M");
  });
});
