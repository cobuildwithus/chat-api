import {
  bigint,
  doublePrecision,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";
import { bytea, farcasterSchema } from "./shared";

export const farcasterProfiles = farcasterSchema.table("profiles", {
  fname: text("fname"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  verifiedAddresses: text("verified_addresses").array(),
  manualVerifiedAddresses: text("manual_verified_addresses").array(),
  neynarUserScore: doublePrecision("neynar_user_score"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  fid: bigint("fid", { mode: "number" }).primaryKey(),
});

export const farcasterCasts = farcasterSchema.table("casts", {
  hash: bytea("hash").primaryKey(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  castTimestamp: timestamp("timestamp", { withTimezone: true }),
  fid: bigint("fid", { mode: "number" }),
  parentHash: bytea("parent_hash"),
  text: text("text"),
  textEmbedding: vector("text_embedding", { dimensions: 256 }),
  rootParentHash: bytea("root_parent_hash"),
  rootParentUrl: text("root_parent_url"),
  viewCount: bigint("view_count", { mode: "number" }),
  replyCount: bigint("reply_count", { mode: "number" }),
  lastReplyAt: timestamp("last_reply_at", { withTimezone: true }),
  lastReplyFid: bigint("last_reply_fid", { mode: "number" }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
});

export type FarcasterProfile = typeof farcasterProfiles.$inferSelect;
export type FarcasterCast = typeof farcasterCasts.$inferSelect;
