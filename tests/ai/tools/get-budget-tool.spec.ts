import { describe, expect, it } from "vitest";
import { getBudgetTool } from "../../../src/ai/tools/get-budget/tool";

describe("getBudgetTool", () => {
  it("exposes tool metadata and prompt", async () => {
    expect(getBudgetTool.name).toBe("getBudget");
    expect(getBudgetTool.tool).toBeDefined();
    await expect(getBudgetTool.prompt()).resolves.toContain("inspect indexed budget state");
  });
});
