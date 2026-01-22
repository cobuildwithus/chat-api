import { getRedisClient } from "../redis";

const CACHE_ENABLED = process.env.NODE_ENV !== "development";
const DEFAULT_TTL = 60 * 60; // 1 hour

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
  if (!CACHE_ENABLED || result === null || result === undefined) return result;

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
  const raw = await redis.get(`${prefix}${key}`);
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
  if (!CACHE_ENABLED || result === null || result === undefined) return result;

  await setCachedResult(key, prefix, result, ttlSeconds);
  return result;
}

export async function deleteCachedResult(key: string, prefix: string): Promise<void> {
  if (!CACHE_ENABLED) return;
  const redis = await getRedisClient();
  await redis.del(`${prefix}${key}`);
}

export async function deleteCachedResultsByPrefix(prefix: string): Promise<void> {
  if (!CACHE_ENABLED) return;
  const redis = await getRedisClient();
  const keys: string[] = [];
  for await (const key of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
    keys.push(key as string);
    if (keys.length >= 500) {
      await redis.del(keys);
      keys.length = 0;
    }
  }
  if (keys.length) {
    await redis.del(keys);
  }
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
  await redis.set(`${prefix}${key}`, valueToCache, { EX: ttl });
}
