import { randomUUID } from "node:crypto";
import { type RedisClientType, createClient } from "redis";

const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.on("error", (err) => console.error("Redis Client Error", err));

let client: Promise<typeof redisClient> | null = null;

export async function getRedisClient() {
  if (!client) {
    client = redisClient
      .connect()
      .then(() => redisClient)
      .catch((error) => {
        client = null;
        throw error;
      });
  }

  return client as unknown as RedisClientType;
}

export async function closeRedisClient(): Promise<void> {
  if (!redisClient.isOpen) return;
  try {
    await redisClient.quit();
  } catch (error) {
    console.error("[redis] failed to quit cleanly", error);
    try {
      await redisClient.disconnect();
    } catch (disconnectError) {
      console.error("[redis] failed to disconnect", disconnectError);
    }
  } finally {
    client = null;
  }
}

type LockOpts = {
  ttlMs?: number;
  maxWaitMs?: number;
  retryMinMs?: number;
  retryMaxMs?: number;
};

type SemaphoreLeaseOptions = {
  maxCount: number;
  ttlMs?: number;
  heartbeatMs?: number;
  member?: string;
};

export type RedisSemaphoreLease = {
  member: string;
  release: () => Promise<void>;
};

const DEFAULT_LOCK_OPTS: Required<LockOpts> = {
  ttlMs: 10_000,
  maxWaitMs: 60_000,
  retryMinMs: 20,
  retryMaxMs: 60,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RELEASE_LUA = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const HEARTBEAT_LUA = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

const ACQUIRE_SEMAPHORE_LUA = `
  local key = KEYS[1]
  local nowMs = tonumber(ARGV[1])
  local ttlMs = tonumber(ARGV[2])
  local maxCount = tonumber(ARGV[3])
  local member = ARGV[4]
  local expiresAt = nowMs + ttlMs

  redis.call("ZREMRANGEBYSCORE", key, "-inf", nowMs)

  local existingScore = redis.call("ZSCORE", key, member)
  if existingScore then
    redis.call("ZADD", key, expiresAt, member)
    redis.call("PEXPIRE", key, ttlMs)
    return {1, redis.call("ZCARD", key)}
  end

  local count = redis.call("ZCARD", key)
  if count >= maxCount then
    return {0, count}
  end

  redis.call("ZADD", key, expiresAt, member)
  redis.call("PEXPIRE", key, ttlMs)
  return {1, count + 1}
`;

const HEARTBEAT_SEMAPHORE_LUA = `
  local key = KEYS[1]
  local member = ARGV[1]
  local expiresAt = tonumber(ARGV[2])
  local ttlMs = tonumber(ARGV[3])

  if redis.call("ZSCORE", key, member) then
    redis.call("ZADD", key, expiresAt, member)
    redis.call("PEXPIRE", key, ttlMs)
    return 1
  end

  return 0
`;

const RELEASE_SEMAPHORE_LUA = `
  return redis.call("ZREM", KEYS[1], ARGV[1])
`;

export async function withRedisLock<T>(
  key: string,
  fn: () => Promise<T>,
  opts?: LockOpts,
): Promise<T> {
  const { ttlMs, maxWaitMs, retryMinMs, retryMaxMs } = {
    ...DEFAULT_LOCK_OPTS,
    ...(opts ?? {}),
  };
  const token = randomUUID();
  const c = await getRedisClient();

  const tryAcquire = async (): Promise<boolean> => {
    const res = await c.set(key, token, { NX: true, PX: ttlMs });
    return res === "OK";
  };

  const start = Date.now();
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await tryAcquire();
    if (ok) break;

    if (Date.now() - start >= maxWaitMs) {
      throw new Error(`NonceLockTimeout:${key}`);
    }
    const delay = Math.floor(retryMinMs + Math.random() * (retryMaxMs - retryMinMs));
    // eslint-disable-next-line no-await-in-loop
    await sleep(delay);
  }

  const hb = setInterval(
    () => {
      void c
        .eval(HEARTBEAT_LUA, {
          keys: [key],
          arguments: [token, String(ttlMs)],
        })
        .catch(() => {});
    },
    Math.max(1000, Math.floor(ttlMs / 3)),
  );
  hb.unref?.();

  try {
    return await fn();
  } finally {
    clearInterval(hb);
    try {
      await c.eval(RELEASE_LUA, { keys: [key], arguments: [token] });
    } catch {
      // ignore
    }
  }
}

export async function acquireRedisSemaphoreLease(
  key: string,
  opts: SemaphoreLeaseOptions,
): Promise<RedisSemaphoreLease | null> {
  const ttlMs = opts.ttlMs ?? 30_000;
  const heartbeatMs = opts.heartbeatMs ?? Math.max(1000, Math.floor(ttlMs / 3));
  const member = opts.member ?? randomUUID();
  const c = await getRedisClient();
  const nowMs = Date.now();

  const raw = (await c.eval(ACQUIRE_SEMAPHORE_LUA, {
    keys: [key],
    arguments: [String(nowMs), String(ttlMs), String(opts.maxCount), member],
  })) as unknown[];

  const acquired = raw[0] === 1 || raw[0] === "1";
  if (!acquired) {
    return null;
  }

  let released = false;
  const heartbeat = setInterval(() => {
    const nextNowMs = Date.now();
    void c
      .eval(HEARTBEAT_SEMAPHORE_LUA, {
        keys: [key],
        arguments: [member, String(nextNowMs + ttlMs), String(ttlMs)],
      })
      .catch(() => {});
  }, heartbeatMs);
  heartbeat.unref?.();

  return {
    member,
    release: async () => {
      if (released) {
        return;
      }
      released = true;
      clearInterval(heartbeat);
      try {
        await c.eval(RELEASE_SEMAPHORE_LUA, {
          keys: [key],
          arguments: [member],
        });
      } catch {
        // ignore
      }
    },
  };
}
