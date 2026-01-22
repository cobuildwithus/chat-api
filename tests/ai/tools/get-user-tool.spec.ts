import { describe, expect, it } from "vitest";
import { getUserTool } from "../../../src/ai/tools/get-user/tool";

describe("getUserTool", () => {
  it("exposes tool metadata", () => {
    expect(getUserTool.name).toBe("getUser");
    expect(getUserTool.tool).toBeDefined();
  });
});
