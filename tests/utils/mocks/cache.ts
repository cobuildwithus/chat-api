import { vi } from "vitest";

const cacheStore = new Map<string, { value: unknown; ttl?: number }>();

// Central mock for src/infra/cache/cacheResult
vi.mock("../../../src/infra/cache/cacheResult", () => {
  return {
    cacheResult: vi.fn(
      async (
        key: string,
        prefix: string,
        fetchFn: () => Promise<unknown>,
        ttlSeconds: number,
      ) => {
        const value = await fetchFn();
        cacheStore.set(`${prefix}${key}`, { value, ttl: ttlSeconds });
        return value;
      },
    ),
    getCachedResult: vi.fn(async (key: string, prefix: string) => {
      const hit = cacheStore.get(`${prefix}${key}`);
      return hit ? hit.value : null;
    }),
    getOrSetCachedResult: vi.fn(
      async (
        key: string,
        prefix: string,
        fetchFn: () => Promise<unknown>,
        ttlSeconds: number,
      ) => {
        const existing = cacheStore.get(`${prefix}${key}`);
        if (existing) return existing.value;
        const value = await fetchFn();
        cacheStore.set(`${prefix}${key}`, { value, ttl: ttlSeconds });
        return value;
      },
    ),
    getOrSetCachedResultWithLock: vi.fn(
      async (
        key: string,
        prefix: string,
        fetchFn: () => Promise<unknown>,
        ttlSeconds: number,
      ) => {
        const existing = cacheStore.get(`${prefix}${key}`);
        if (existing) return existing.value;
        const value = await fetchFn();
        if (value === null || value === undefined) return value;
        cacheStore.set(`${prefix}${key}`, { value, ttl: ttlSeconds });
        return value;
      },
    ),
    deleteCachedResult: vi.fn(async (key: string, prefix: string) => {
      cacheStore.delete(`${prefix}${key}`);
    }),
    deleteCachedResultsByPrefix: vi.fn(async (prefix: string) => {
      for (const key of cacheStore.keys()) {
        if (key.startsWith(prefix)) {
          cacheStore.delete(key);
        }
      }
    }),
  };
});

export function resetCacheMocks() {
  cacheStore.clear();
}

export function getCachedEntry(prefix: string, key: string) {
  return cacheStore.get(`${prefix}${key}`);
}
