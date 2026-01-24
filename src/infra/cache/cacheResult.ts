import { getRedisClient, withRedisLock } from "../redis";

const CACHE_ENABLED = process.env.NODE_ENV !== "development";
const DEFAULT_TTL = 60 * 60; // 1 hour
const getCacheKey = (key: string, prefix: string) => `${prefix}${key}`;

const shouldCacheResult = (result: unknown): boolean =>
  CACHE_ENABLED && result !== null && result !== undefined;

/**
 * Generic cache function that stores results in Redis.
 * Caching is disabled in development environment.
 */
export async function cacheResult<T>(
  key: string,
  prefix: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL,
): Promise<T> {
  const result = await fetchFn();
  if (!shouldCacheResult(result)) return result;

  await setCachedResult(key, prefix, result, ttlSeconds);

  return result;
}

/**
 * Helper function to get a cached result from Redis.
 * Returns null if not found or if caching is disabled.
 */
export async function getCachedResult<T>(key: string, prefix: string): Promise<T | null> {
  if (!CACHE_ENABLED) return null;
  const redis = await getRedisClient();
  const raw = await redis.get(getCacheKey(key, prefix));
  if (raw == null) return null;

  if (raw.length && raw[0] !== "{" && raw[0] !== "[") return raw as unknown as T;

  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      (typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length)
    ) {
      return parsed as T;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getOrSetCachedResult<T>(
  key: string,
  prefix: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL,
): Promise<T> {
  const cached = await getCachedResult<T>(key, prefix);
  if (cached !== null) return cached;

  const result = await fetchFn();
  if (!shouldCacheResult(result)) return result;

  await setCachedResult(key, prefix, result, ttlSeconds);
  return result;
}

export async function getOrSetCachedResultWithLock<T>(
  key: string,
  prefix: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL,
  opts?: { lockTtlMs?: number; maxWaitMs?: number },
): Promise<T> {
  const cached = await getCachedResult<T>(key, prefix);
  if (cached !== null) return cached;

  const lockKey = `${prefix}lock:${key}`;
  const { lockTtlMs = 5_000, maxWaitMs = 5_000 } = opts ?? {};

  return withRedisLock(
    lockKey,
    async () => {
      const cachedAfterLock = await getCachedResult<T>(key, prefix);
      if (cachedAfterLock !== null) return cachedAfterLock;

      const result = await fetchFn();
      if (!shouldCacheResult(result)) return result;
      await setCachedResult(key, prefix, result, ttlSeconds);
      return result;
    },
    { ttlMs: lockTtlMs, maxWaitMs },
  );
}

export async function deleteCachedResult(key: string, prefix: string): Promise<void> {
  if (!CACHE_ENABLED) return;
  const redis = await getRedisClient();
  await redis.del(getCacheKey(key, prefix));
}

export async function deleteCachedResultsByPrefix(prefix: string): Promise<void> {
  if (!CACHE_ENABLED) return;
  const redis = await getRedisClient();
  const keys: string[] = [];
  const flush = async () => {
    if (!keys.length) return;
    const batch = keys.splice(0, keys.length);
    await redis.del(batch);
  };
  for await (const key of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
    keys.push(key as string);
    if (keys.length >= 500) {
      await flush();
    }
  }
  await flush();
}

async function setCachedResult<T>(
  key: string,
  prefix: string,
  result: T,
  ttlSeconds: number,
): Promise<void> {
  const valueToCache = typeof result === "string" ? result : JSON.stringify(result);
  const redis = await getRedisClient();
  const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? Math.floor(ttlSeconds) : DEFAULT_TTL;
  await redis.set(getCacheKey(key, prefix), valueToCache, { EX: ttl });
}
