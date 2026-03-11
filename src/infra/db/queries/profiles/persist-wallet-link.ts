import { normalizeEvmAddress } from "@cobuild/wire";
import { sql } from "drizzle-orm";
import { cobuildPrimaryDb } from "../../cobuildDb";
import { farcasterProfiles } from "../../schema";

type PersistFarcasterWalletLinkParams = {
  fid: number;
  address: string;
};

type PersistFarcasterWalletLinkResult = {
  fid: number;
  address: `0x${string}`;
};

export async function persistFarcasterWalletLink(
  params: PersistFarcasterWalletLinkParams,
): Promise<PersistFarcasterWalletLinkResult> {
  const fid = params.fid;
  if (!Number.isSafeInteger(fid) || fid <= 0) {
    throw new Error("Invalid Farcaster fid.");
  }

  const address = normalizeEvmAddress(params.address, "address");
  const now = new Date();
  const addressArraySql = sql`ARRAY[${address}]::text[]`;
  const mergedVerifiedAddressesSql = sql`(
    SELECT ARRAY(
      SELECT DISTINCT x
      FROM unnest(
        coalesce(${farcasterProfiles.verifiedAddresses}, '{}'::text[])
        || coalesce(${farcasterProfiles.manualVerifiedAddresses}, '{}'::text[])
        || ${addressArraySql}
      ) AS t(x)
    )
  )`;
  const mergedManualVerifiedAddressesSql = sql`(
    SELECT ARRAY(
      SELECT DISTINCT x
      FROM unnest(
        coalesce(${farcasterProfiles.manualVerifiedAddresses}, '{}'::text[])
        || ${addressArraySql}
      ) AS t(x)
    )
  )`;

  await cobuildPrimaryDb()
    .insert(farcasterProfiles)
    .values({
      fid,
      verifiedAddresses: [address],
      manualVerifiedAddresses: [address],
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: farcasterProfiles.fid,
      set: {
        verifiedAddresses: mergedVerifiedAddressesSql,
        manualVerifiedAddresses: mergedManualVerifiedAddressesSql,
        updatedAt: now,
      },
    });

  return {
    fid,
    address,
  };
}
