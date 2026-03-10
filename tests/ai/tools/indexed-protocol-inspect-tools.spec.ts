import { describe, expect, it } from "vitest";
import { getDisputeTool } from "../../../src/ai/tools/get-dispute/tool";
import { getPremiumEscrowTool } from "../../../src/ai/tools/get-premium-escrow/tool";
import { getStakePositionTool } from "../../../src/ai/tools/get-stake-position/tool";
import { getTcrRequestTool } from "../../../src/ai/tools/get-tcr-request/tool";

describe("indexed protocol inspect AI tools", () => {
  it("exposes getTcrRequest metadata and prompt", async () => {
    expect(getTcrRequestTool.name).toBe("getTcrRequest");
    expect(getTcrRequestTool.tool).toBeDefined();
    await expect(getTcrRequestTool.prompt()).resolves.toContain("inspect indexed TCR request state");
  });

  it("exposes getDispute metadata and prompt", async () => {
    expect(getDisputeTool.name).toBe("getDispute");
    expect(getDisputeTool.tool).toBeDefined();
    await expect(getDisputeTool.prompt()).resolves.toContain("inspect indexed arbitrator dispute state");
  });

  it("exposes getStakePosition metadata and prompt", async () => {
    expect(getStakePositionTool.name).toBe("getStakePosition");
    expect(getStakePositionTool.tool).toBeDefined();
    await expect(getStakePositionTool.prompt()).resolves.toContain("inspect indexed stake-vault account state");
  });

  it("exposes getPremiumEscrow metadata and prompt", async () => {
    expect(getPremiumEscrowTool.name).toBe("getPremiumEscrow");
    expect(getPremiumEscrowTool.tool).toBeDefined();
    await expect(getPremiumEscrowTool.prompt()).resolves.toContain("inspect indexed premium escrow state");
  });
});
