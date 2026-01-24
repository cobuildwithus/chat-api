import { beforeEach, describe, expect, it, vi } from "vitest";

const redisGet = vi.fn();
const redisSet = vi.fn();
const redisDel = vi.fn();
const redisScanIterator = vi.fn();
const withRedisLock = vi.fn(async (_key: string, fn: () => Promise<unknown>) => fn());

vi.mock("../../src/infra/redis", () => ({
  getRedisClient: vi.fn(async () => ({
    get: redisGet,
    set: redisSet,
    del: redisDel,
    scanIterator: redisScanIterator,
  })),
  withRedisLock,
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

  it("caches string results without json encoding", async () => {
    process.env.NODE_ENV = "production";
    const { cacheResult } = await import("../../src/infra/cache/cacheResult");

    const result = await cacheResult("key2", "prefix:", async () => "value", 30);
    expect(result).toBe("value");
    expect(redisSet).toHaveBeenCalledWith("prefix:key2", "value", { EX: 30 });
  });

  it("reads cached values and handles invalid json", async () => {
    process.env.NODE_ENV = "production";
    const {
      deleteCachedResult,
      deleteCachedResultsByPrefix,
      getCachedResult,
      getOrSetCachedResult,
      getOrSetCachedResultWithLock,
    } = await import("../../src/infra/cache/cacheResult");
      await import("../../src/infra/cache/cacheResult");

    redisGet.mockResolvedValueOnce("plain");
    await expect(getCachedResult("key", "prefix:")).resolves.toBe("plain");

    redisGet.mockResolvedValueOnce("{}");
    await expect(getCachedResult("key", "prefix:")).resolves.toBeNull();

    redisGet.mockResolvedValueOnce("[1,2]");
    await expect(getCachedResult("key", "prefix:")).resolves.toEqual([1, 2]);

    redisGet.mockResolvedValueOnce("{broken");
    await expect(getCachedResult("key", "prefix:")).resolves.toBeNull();

    redisGet.mockResolvedValueOnce("cached");
    await expect(
      getOrSetCachedResult("key", "prefix:", async () => "fresh"),
    ).resolves.toBe("cached");

    redisGet.mockResolvedValueOnce(null);
    await expect(
      getOrSetCachedResult("key", "prefix:", async () => "fresh"),
    ).resolves.toBe("fresh");
    expect(redisSet).toHaveBeenCalled();

    redisGet.mockResolvedValueOnce(null).mockResolvedValueOnce("locked");
    const lockedResult = await getOrSetCachedResultWithLock(
      "key-lock",
      "prefix:",
      async () => "fresh",
    );
    expect(lockedResult).toBe("locked");
    expect(withRedisLock).toHaveBeenCalledWith(
      "prefix:lock:key-lock",
      expect.any(Function),
      expect.any(Object),
    );

    redisGet.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(
      getOrSetCachedResultWithLock("key-miss", "prefix:", async () => "fresh"),
    ).resolves.toBe("fresh");
    expect(redisSet).toHaveBeenCalled();

    await deleteCachedResult("key", "prefix:");
    expect(redisDel).toHaveBeenCalledWith("prefix:key");

    const keys = Array.from({ length: 501 }, (_, index) => `k${index}`);
    const deletedBatches: string[][] = [];
    redisDel.mockImplementation((value) => {
      if (Array.isArray(value)) deletedBatches.push([...value]);
      return Promise.resolve();
    });
    redisScanIterator.mockImplementation(async function* () {
      for (const key of keys) yield key;
    });

    await deleteCachedResultsByPrefix("prefix:");
    const flattened = deletedBatches.flat();
    expect(flattened).toEqual(expect.arrayContaining(keys));
  });
});
