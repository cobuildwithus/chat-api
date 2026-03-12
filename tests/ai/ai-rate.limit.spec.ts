import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  admitAiGeneration,
  isAiUsageAvailable,
  recordAiUsage,
} from "../../src/ai/ai-rate.limit";
import { acquireRedisSemaphoreLease } from "../../src/infra/redis";
import {
  checkAndRecordUsage,
  getUsage,
  recordUsage,
  removeRecordedUsage,
} from "../../src/infra/rate-limit";

vi.mock("../../src/infra/rate-limit", () => ({
  checkAndRecordUsage: vi.fn(),
  getUsage: vi.fn(),
  recordUsage: vi.fn(),
  removeRecordedUsage: vi.fn(),
}));

vi.mock("../../src/infra/redis", () => ({
  acquireRedisSemaphoreLease: vi.fn(),
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

  it("admits a generation only after inflight leases and atomic quota reservation succeed", async () => {
    const userLease = { member: "request-1", release: vi.fn().mockResolvedValue(undefined) };
    const chatLease = { member: "request-1", release: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(acquireRedisSemaphoreLease)
      .mockResolvedValueOnce(userLease)
      .mockResolvedValueOnce(chatLease);
    vi.mocked(checkAndRecordUsage).mockResolvedValueOnce({
      allowed: true,
      usage: 1000,
      retryAfterSeconds: 0,
      memberValue: "1000|request-1",
    });

    const result = await admitAiGeneration("0xabc", "chat-1", "request-1");

    expect(result.allowed).toBe(true);
    if (!result.allowed) {
      throw new Error("expected admission to succeed");
    }
    expect(acquireRedisSemaphoreLease).toHaveBeenNthCalledWith(1, "ai:inflight:user:0xabc", {
      maxCount: 2,
      ttlMs: 60000,
      member: "request-1",
    });
    expect(acquireRedisSemaphoreLease).toHaveBeenNthCalledWith(2, "ai:inflight:chat:chat-1", {
      maxCount: 1,
      ttlMs: 60000,
      member: "request-1",
    });
    expect(checkAndRecordUsage).toHaveBeenCalledWith("ai:0xabc", {
      windowMinutes: 360,
      maxUsage: 2000000,
      usageToAdd: 1000,
      memberValue: "1000|request-1",
    });

    await result.admission.finalizeUsage(1500);
    expect(recordUsage).toHaveBeenCalledWith("ai:0xabc", 500);
    await result.admission.release();
    expect(removeRecordedUsage).not.toHaveBeenCalled();
    expect(userLease.release).toHaveBeenCalledTimes(1);
    expect(chatLease.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back the reserved usage when generation is released before finalize", async () => {
    const userLease = { member: "request-1", release: vi.fn().mockResolvedValue(undefined) };
    const chatLease = { member: "request-1", release: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(acquireRedisSemaphoreLease)
      .mockResolvedValueOnce(userLease)
      .mockResolvedValueOnce(chatLease);
    vi.mocked(checkAndRecordUsage).mockResolvedValueOnce({
      allowed: true,
      usage: 1000,
      retryAfterSeconds: 0,
      memberValue: "1000|request-1",
    });

    const result = await admitAiGeneration("0xabc", "chat-1", "request-1");

    expect(result.allowed).toBe(true);
    if (!result.allowed) {
      throw new Error("expected admission to succeed");
    }

    await result.admission.release();

    expect(removeRecordedUsage).toHaveBeenCalledWith("ai:0xabc", "1000|request-1");
    expect(userLease.release).toHaveBeenCalledTimes(1);
    expect(chatLease.release).toHaveBeenCalledTimes(1);
  });

  it("releases inflight leases when quota reservation fails", async () => {
    const userLease = { member: "request-1", release: vi.fn().mockResolvedValue(undefined) };
    const chatLease = { member: "request-1", release: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(acquireRedisSemaphoreLease)
      .mockResolvedValueOnce(userLease)
      .mockResolvedValueOnce(chatLease);
    vi.mocked(checkAndRecordUsage).mockResolvedValueOnce({
      allowed: false,
      usage: 2000000,
      retryAfterSeconds: 9,
    });

    const result = await admitAiGeneration("0xabc", "chat-1", "request-1");

    expect(result).toEqual({
      allowed: false,
      code: "rate-limited",
      retryAfterSeconds: 9,
    });
    expect(userLease.release).toHaveBeenCalledTimes(1);
    expect(chatLease.release).toHaveBeenCalledTimes(1);
  });

  it("denies when user or chat inflight limits are exhausted", async () => {
    vi.mocked(acquireRedisSemaphoreLease).mockResolvedValueOnce(null);

    await expect(admitAiGeneration("0xabc", "chat-1", "request-1")).resolves.toEqual({
      allowed: false,
      code: "user-inflight-limit",
      retryAfterSeconds: 1,
    });

    const userLease = { member: "request-1", release: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(acquireRedisSemaphoreLease)
      .mockResolvedValueOnce(userLease)
      .mockResolvedValueOnce(null);

    await expect(admitAiGeneration("0xabc", "chat-1", "request-1")).resolves.toEqual({
      allowed: false,
      code: "chat-inflight-limit",
      retryAfterSeconds: 1,
    });
    expect(userLease.release).toHaveBeenCalledTimes(1);
  });
});
