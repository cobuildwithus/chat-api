import { arrayContains } from "drizzle-orm";
import { getRedisClient } from "../../../redis";
import { type FarcasterProfile, farcasterProfiles } from "../../schema";
import { cobuildDb } from "../../cobuildDb";

export const getFarcasterProfileByAddress = async (
  address: string,
): Promise<FarcasterProfile | null> => {
  try {
    const cacheKey = `farcaster-profile-by-address:${address}`;
    const redisClient = await getRedisClient();
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const profile = JSON.parse(cached);
      if (profile.fid > 0) return profile as FarcasterProfile;
      await redisClient.del(cacheKey); // delete invalid cache
    }

    // Query database if not in cache
    const profile = await cobuildDb
      .select()
      .from(farcasterProfiles)
      .where(arrayContains(farcasterProfiles.verifiedAddresses, [address]));

    if (profile.length === 0) return null;

    const result = profile.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))[0];

    if (result) {
      await redisClient.set(cacheKey, JSON.stringify(result), {
        EX: 60 * 60 * 24, // 24 hour TTL
      });
    }

    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
};
