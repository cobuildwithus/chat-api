import { arrayContains } from "drizzle-orm";
import {
  deleteCachedResult,
  getOrSetCachedResultWithLock,
} from "../../../cache/cacheResult";
import { type FarcasterProfile, farcasterProfiles } from "../../schema";
import { cobuildDb } from "../../cobuildDb";

const PROFILE_BY_ADDRESS_CACHE_PREFIX = "farcaster-profile-by-address:";
const PROFILE_BY_ADDRESS_CACHE_TTL_SECONDS = 60 * 60 * 24;

async function fetchLatestFarcasterProfileByAddress(
  address: string,
): Promise<FarcasterProfile | null> {
  const profile = await cobuildDb
    .select()
    .from(farcasterProfiles)
    .where(arrayContains(farcasterProfiles.verifiedAddresses, [address]));

  if (profile.length === 0) return null;
  return profile.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))[0];
}

export const getFarcasterProfileByAddress = async (
  address: string,
): Promise<FarcasterProfile | null> => {
  try {
    const loadProfile = () =>
      getOrSetCachedResultWithLock<FarcasterProfile | null>(
        address,
        PROFILE_BY_ADDRESS_CACHE_PREFIX,
        () => fetchLatestFarcasterProfileByAddress(address),
        PROFILE_BY_ADDRESS_CACHE_TTL_SECONDS,
      );

    const profile = await loadProfile();
    if (!profile || profile.fid > 0) return profile;

    await deleteCachedResult(address, PROFILE_BY_ADDRESS_CACHE_PREFIX);
    const refreshed = await loadProfile();
    return refreshed && refreshed.fid > 0 ? refreshed : null;
  } catch (error) {
    console.error(error);
    return null;
  }
};
