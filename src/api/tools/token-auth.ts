import { and, eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { normalizeAddress } from "../../chat/address";
import { cobuildDb } from "../../infra/db/cobuildDb";
import { buildBotCliTokens } from "../../infra/db/schema";
import { getRedisClient } from "../../infra/redis";

const AUTH_CACHE_TTL_SECONDS = 60;
const LAST_USED_WRITE_THROTTLE_SECONDS = 15 * 60;
const AUTH_CACHE_PREFIX = "buildbot:tools-auth:";
const LAST_USED_THROTTLE_PREFIX = "buildbot:tools-last-used:";

type CachedToolsPrincipal = {
  ownerAddress: string;
  agentKey: string;
};

function hashBuildBotToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function authenticateToolsBearerToken(rawToken: string): Promise<{
  ownerAddress: `0x${string}`;
  agentKey: string;
} | null> {
  const tokenHash = hashBuildBotToken(rawToken);
  const cacheKey = `${AUTH_CACHE_PREFIX}${tokenHash}`;

  let cached: CachedToolsPrincipal | null = null;
  try {
    const redis = await getRedisClient();
    const cachedRaw = await redis.get(cacheKey);
    if (typeof cachedRaw === "string") {
      cached = JSON.parse(cachedRaw) as CachedToolsPrincipal;
    }
  } catch {
    cached = null;
  }

  if (cached) {
    const ownerAddress = normalizeAddress(cached.ownerAddress);
    if (!ownerAddress) return null;

    void touchLastUsedAtThrottled(tokenHash);
    return {
      ownerAddress: ownerAddress as `0x${string}`,
      agentKey: cached.agentKey,
    };
  }

  const primaryDb = cobuildDb.$primary ?? cobuildDb;
  const [row] = await primaryDb
    .select({
      ownerAddress: buildBotCliTokens.ownerAddress,
      agentKey: buildBotCliTokens.agentKey,
    })
    .from(buildBotCliTokens)
    .where(
      and(eq(buildBotCliTokens.tokenHash, tokenHash), isNull(buildBotCliTokens.revokedAt)),
    )
    .limit(1);

  if (!row) return null;
  const ownerAddress = normalizeAddress(row.ownerAddress);
  if (!ownerAddress) return null;

  try {
    const redis = await getRedisClient();
    await redis.set(cacheKey, JSON.stringify(row), { EX: AUTH_CACHE_TTL_SECONDS });
  } catch {
    // Best-effort cache write; auth correctness remains DB-backed.
  }

  void touchLastUsedAtThrottled(tokenHash);
  return {
    ownerAddress: ownerAddress as `0x${string}`,
    agentKey: row.agentKey,
  };
}

async function touchLastUsedAtThrottled(tokenHash: string): Promise<void> {
  const throttleKey = `${LAST_USED_THROTTLE_PREFIX}${tokenHash}`;
  let shouldWrite = true;

  try {
    const redis = await getRedisClient();
    const lock = await redis.set(throttleKey, "1", {
      NX: true,
      EX: LAST_USED_WRITE_THROTTLE_SECONDS,
    });
    shouldWrite = lock === "OK";
  } catch {
    shouldWrite = false;
  }

  if (!shouldWrite) return;

  try {
    const primaryDb = cobuildDb.$primary ?? cobuildDb;
    await primaryDb
      .update(buildBotCliTokens)
      .set({ lastUsedAt: new Date() })
      .where(
        and(eq(buildBotCliTokens.tokenHash, tokenHash), isNull(buildBotCliTokens.revokedAt)),
      );
  } catch (error) {
    console.error("[tools-auth] failed to update lastUsedAt", error);
  }
}
