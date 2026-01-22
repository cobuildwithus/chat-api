import { getRedisClient } from "./redis";

const GET_USAGE_LUA = `
  local key         = KEYS[1]
  local windowStart = tonumber(ARGV[1])

  redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

  local vals = redis.call('ZRANGEBYSCORE', key, windowStart, '+inf')
  local sum  = 0
  for i = 1, #vals do
    sum = sum + tonumber(vals[i])
  end
  return sum
`;

export async function getUsage(key: string, windowMinutes: number): Promise<number> {
  const redisClient = await getRedisClient();
  const windowStart = Date.now() - windowMinutes * 60 * 1000;

  try {
    const usage = (await redisClient.eval(GET_USAGE_LUA, {
      keys: [key],
      arguments: [String(windowStart)],
    })) as number;

    if (process.env.NODE_ENV !== "production") {
      console.debug("Checking usage", key, usage);
    }

    return usage;
  } catch (error) {
    console.error("Error getting usage:", error);
    throw error;
  }
}

export async function recordUsage(key: string, usage: number): Promise<void> {
  const redisClient = await getRedisClient();
  const now = Date.now();
  const oneDaySeconds = 24 * 60 * 60; // fallback TTL

  try {
    await redisClient
      .multi()
      .zAdd(key, { score: now, value: String(usage) })
      .expire(key, oneDaySeconds)
      .exec();

    if (process.env.NODE_ENV !== "production") {
      console.debug("Recorded usage", key, usage);
    }
  } catch (error) {
    console.error("Error recording usage:", error);
    throw error;
  }
}
