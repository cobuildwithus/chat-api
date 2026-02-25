import { getRedisClient } from "./redis";

const GET_USAGE_LUA = `
  local key         = KEYS[1]
  local windowStart = tonumber(ARGV[1])

  redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

  local vals = redis.call('ZRANGEBYSCORE', key, windowStart, '+inf')
  local sum  = 0
  for i = 1, #vals do
    local entry = vals[i]
    local amount = tonumber(entry)
    if not amount then
      local separator = string.find(entry, '|', 1, true)
      if separator then
        amount = tonumber(string.sub(entry, 1, separator - 1))
      end
    end
    if amount then
      sum = sum + amount
    end
  end
  return sum
`;

const CHECK_AND_RECORD_USAGE_LUA = `
  local key          = KEYS[1]
  local nowMs        = tonumber(ARGV[1])
  local windowMs     = tonumber(ARGV[2])
  local maxUsage     = tonumber(ARGV[3])
  local usageToAdd   = tonumber(ARGV[4])
  local ttlSeconds   = tonumber(ARGV[5])
  local memberValue  = ARGV[6]
  local windowStart  = nowMs - windowMs

  redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

  local vals = redis.call('ZRANGEBYSCORE', key, windowStart, '+inf')
  local sum  = 0
  for i = 1, #vals do
    local entry = vals[i]
    local amount = tonumber(entry)
    if not amount then
      local separator = string.find(entry, '|', 1, true)
      if separator then
        amount = tonumber(string.sub(entry, 1, separator - 1))
      end
    end
    if amount then
      sum = sum + amount
    end
  end

  if sum + usageToAdd > maxUsage then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retryAfterMs = 1000
    if #oldest >= 2 then
      local oldestScore = tonumber(oldest[2]) or nowMs
      local resetAtMs = oldestScore + windowMs
      retryAfterMs = resetAtMs - nowMs
      if retryAfterMs < 1000 then
        retryAfterMs = 1000
      end
    end
    return {0, sum, retryAfterMs}
  end

  redis.call('ZADD', key, nowMs, memberValue)
  redis.call('EXPIRE', key, ttlSeconds)
  return {1, sum + usageToAdd, 0}
`;

const ONE_DAY_SECONDS = 24 * 60 * 60;

function buildUsageMember(nowMs: number, usage: number): string {
  const suffix = `${Math.random()}`.slice(2);
  return `${usage}|${nowMs}|${suffix}`;
}

function tryParseUsage(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const separatorIndex = value.indexOf("|");
  if (separatorIndex <= 0) {
    return null;
  }

  const prefix = Number(value.slice(0, separatorIndex));
  return Number.isFinite(prefix) ? prefix : null;
}

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

  try {
    await redisClient
      .multi()
      .zAdd(key, { score: now, value: buildUsageMember(now, usage) })
      .expire(key, ONE_DAY_SECONDS)
      .exec();

    if (process.env.NODE_ENV !== "production") {
      console.debug("Recorded usage", key, usage);
    }
  } catch (error) {
    console.error("Error recording usage:", error);
    throw error;
  }
}

type CheckAndRecordUsageOptions = {
  windowMinutes: number;
  maxUsage: number;
  usageToAdd: number;
  nowMs?: number;
  ttlSeconds?: number;
};

export type CheckAndRecordUsageResult = {
  allowed: boolean;
  usage: number;
  retryAfterSeconds: number;
};

export async function checkAndRecordUsage(
  key: string,
  options: CheckAndRecordUsageOptions,
): Promise<CheckAndRecordUsageResult> {
  const redisClient = await getRedisClient();
  const nowMs = options.nowMs ?? Date.now();
  const ttlSeconds = options.ttlSeconds ?? ONE_DAY_SECONDS;
  const windowMs = Math.floor(options.windowMinutes * 60 * 1000);
  const usageToAdd = options.usageToAdd;
  const memberValue = buildUsageMember(nowMs, usageToAdd);

  try {
    const raw = (await redisClient.eval(CHECK_AND_RECORD_USAGE_LUA, {
      keys: [key],
      arguments: [
        String(nowMs),
        String(windowMs),
        String(options.maxUsage),
        String(usageToAdd),
        String(ttlSeconds),
        memberValue,
      ],
    })) as unknown[];

    const allowed = tryParseUsage(raw[0]) === 1;
    const usage = Math.max(0, tryParseUsage(raw[1]) ?? 0);
    const retryAfterMs = Math.max(0, tryParseUsage(raw[2]) ?? 0);
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

    return {
      allowed,
      usage,
      retryAfterSeconds: allowed ? 0 : retryAfterSeconds,
    };
  } catch (error) {
    console.error("Error checking and recording usage:", error);
    throw error;
  }
}
