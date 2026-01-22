import { beforeEach, describe, expect, it, vi } from "vitest";

const redisGet = vi.fn();
const redisSet = vi.fn();

vi.mock("../../src/infra/redis", () => ({
  getRedisClient: vi.fn(async () => ({
    get: redisGet,
    set: redisSet,
  })),
}));

describe("cacheResult", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("../../src/infra/cache/cacheResult");
  });

  it("skips caching in development", async () => {
    process.env.NODE_ENV = "development";
    const { cacheResult } = await import("../../src/infra/cache/cacheResult");

    const result = await cacheResult("key", "prefix:", async () => "value", 10);
    expect(result).toBe("value");
    expect(redisSet).not.toHaveBeenCalled();
  });

  it("returns null when cache is disabled", async () => {
    process.env.NODE_ENV = "development";
    const { getCachedResult } = await import("../../src/infra/cache/cacheResult");

    const result = await getCachedResult("key", "prefix:");
    expect(result).toBeNull();
  });

  it("caches values with default ttl", async () => {
    process.env.NODE_ENV = "production";
    const { cacheResult } = await import("../../src/infra/cache/cacheResult");

    const result = await cacheResult("key", "prefix:", async () => ({ ok: true }), -5);
    expect(result).toEqual({ ok: true });
    expect(redisSet).toHaveBeenCalledWith("prefix:key", expect.any(String), { EX: 3600 });
  });

  it("reads cached values and handles invalid json", async () => {
    process.env.NODE_ENV = "production";
    const { getCachedResult } = await import("../../src/infra/cache/cacheResult");

    redisGet.mockResolvedValueOnce("plain");
    await expect(getCachedResult("key", "prefix:")).resolves.toBe("plain");

    redisGet.mockResolvedValueOnce("{}");
    await expect(getCachedResult("key", "prefix:")).resolves.toBeNull();

    redisGet.mockResolvedValueOnce("[1,2]");
    await expect(getCachedResult("key", "prefix:")).resolves.toEqual([1, 2]);

    redisGet.mockResolvedValueOnce("{broken");
    await expect(getCachedResult("key", "prefix:")).resolves.toBeNull();
  });
});
