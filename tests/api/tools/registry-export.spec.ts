import { describe, expect, it } from "vitest";
import { resolveToolMetadata } from "../../../src/api/tools/registry";

describe("api tools registry export", () => {
  it("re-exports tool metadata helpers", () => {
    expect(resolveToolMetadata("get-user")?.name).toBe("get-user");
    expect(resolveToolMetadata("get-goal")?.name).toBe("get-goal");
    expect(resolveToolMetadata("get-budget")?.name).toBe("get-budget");
    expect(resolveToolMetadata("get-tcr-request")?.name).toBe("get-tcr-request");
    expect(resolveToolMetadata("get-dispute")?.name).toBe("get-dispute");
    expect(resolveToolMetadata("get-stake-position")?.name).toBe("get-stake-position");
    expect(resolveToolMetadata("get-premium-escrow")?.name).toBe("get-premium-escrow");
    expect(resolveToolMetadata("list-wallet-notifications")?.name).toBe("list-wallet-notifications");
  });
});
