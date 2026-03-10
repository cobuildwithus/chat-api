import { describe, expect, it } from "vitest";
import { resolveToolMetadata } from "../../../src/api/tools/registry";

describe("api tools registry export", () => {
  it("re-exports tool metadata helpers", () => {
    expect(resolveToolMetadata("get-user")?.name).toBe("get-user");
    expect(resolveToolMetadata("get-goal")?.name).toBe("get-goal");
    expect(resolveToolMetadata("get-budget")?.name).toBe("get-budget");
    expect(resolveToolMetadata("list-wallet-notifications")?.name).toBe("list-wallet-notifications");
  });
});
