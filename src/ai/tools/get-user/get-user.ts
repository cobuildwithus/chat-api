import { tool } from "ai";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { farcasterProfiles } from "../../../infra/db/schema";
import { cobuildDb } from "../../../infra/db/cobuildDb";
import { getOrSetCachedResult } from "../../../infra/cache/cacheResult";

const CACHE_PREFIX = "farcaster:get-user:";
const CACHE_TTL_SECONDS = 60 * 10;

export const getUser = tool({
  inputSchema: z.object({ fname: z.string() }),
  description:
    "Get user details including FID and verified addresses for a given Farcaster profile given their fname (username)",
  execute: async ({ fname }: { fname: string }) => {
    const cacheKey = fname.trim().toLowerCase();
    console.debug(`Getting user details for ${fname}`);

    return getOrSetCachedResult(
      cacheKey,
      CACHE_PREFIX,
      async () => {
        // Try exact match first
        const user = await cobuildDb
          .select()
          .from(farcasterProfiles)
          .where(eq(farcasterProfiles.fname, fname))
          .limit(1)
          .then((results) => results[0]);

        // If no exact match, try LIKE query
        if (!user) {
          const users = await cobuildDb
            .select()
            .from(farcasterProfiles)
            .where(sql`${farcasterProfiles.fname} ILIKE ${`%${fname}%`}`);
          return { usedLikeQuery: true, users };
        }

        return {
          fid: user.fid,
          fname: user.fname,
          addresses: user.verifiedAddresses || [],
        };
      },
      CACHE_TTL_SECONDS
    );
  },
});
