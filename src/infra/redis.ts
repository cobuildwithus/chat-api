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
