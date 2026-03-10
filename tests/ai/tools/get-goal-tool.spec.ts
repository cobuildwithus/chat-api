import { describe, expect, it } from "vitest";
import { getGoalTool } from "../../../src/ai/tools/get-goal/tool";

describe("getGoalTool", () => {
  it("exposes tool metadata and prompt", async () => {
    expect(getGoalTool.name).toBe("getGoal");
    expect(getGoalTool.tool).toBeDefined();
    await expect(getGoalTool.prompt()).resolves.toContain("inspect indexed goal state");
  });
});
