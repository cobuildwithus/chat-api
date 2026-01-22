import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isAiUsageAvailable,
  isAiUsageAvailablePerFid,
  recordAiUsage,
  recordAiUsagePerFid,
} from "../../src/ai/ai-rate.limit";
import { getUsage, recordUsage } from "../../src/infra/rate-limit";

vi.mock("../../src/infra/rate-limit", () => ({
  getUsage: vi.fn(),
  recordUsage: vi.fn(),
}));

describe("ai-rate.limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "development";
  });

  it("checks and records usage per address", async () => {
    vi.mocked(getUsage).mockResolvedValueOnce(10);

    await expect(isAiUsageAvailable("0xabc")).resolves.toBe(true);
    expect(getUsage).toHaveBeenCalledWith("ai:0xabc", 360);

    vi.mocked(getUsage).mockResolvedValueOnce(3_000_000);
    await expect(isAiUsageAvailable("0xabc")).resolves.toBe(false);

    await recordAiUsage("0xabc", 25);
    expect(recordUsage).toHaveBeenCalledWith("ai:0xabc", 25);
  });

  it("checks and records usage per fid", async () => {
    vi.mocked(getUsage).mockResolvedValueOnce(300000);

    await expect(isAiUsageAvailablePerFid(123)).resolves.toBe(false);
    expect(getUsage).toHaveBeenCalledWith("ai:fid:123", 1440);

    await recordAiUsagePerFid(123, 500);
    expect(recordUsage).toHaveBeenCalledWith("ai:fid:123", 500);
  });
});
