import {
  bigint,
  customType,
  doublePrecision,
  index,
  integer,
  json,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

const cobuildSchema = pgSchema("cobuild");
const farcasterSchema = pgSchema("farcaster");
const onchainSchema = pgSchema("cobuild-onchain");

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const chat = cobuildSchema.table("chat", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title"),
  data: json("data").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  user: text("user").notNull(),
});

export const chatMessage = cobuildSchema.table(
  "chat_message",
  {
    id: text("id").primaryKey(),
    chatId: text("chatId")
      .notNull()
      .references(() => chat.id),
    clientId: text("clientId"),
    role: text("role").notNull(),
    parts: jsonb("parts").notNull(),
    metadata: jsonb("metadata"),
    position: integer("position").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    chatClientIdUnique: uniqueIndex("chat_message_chat_client_id_uq").on(
      table.chatId,
      table.clientId,
    ),
  }),
);

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

export const buildBotCliTokens = cobuildSchema.table(
  "build_bot_cli_tokens",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey(),
    ownerAddress: text("owner_address").notNull(),
    agentKey: text("agent_key").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    buildBotCliTokensTokenHashUnique: uniqueIndex("build_bot_cli_tokens_token_hash_uq").on(
      table.tokenHash,
    ),
    buildBotCliTokensOwnerAgentIdx: index("build_bot_cli_tokens_owner_agent_idx").on(
      table.ownerAddress,
      table.agentKey,
    ),
  }),
);

export const onchainProjects = onchainSchema.table("project", {
  chainId: integer("chain_id").notNull(),
  projectId: integer("project_id").notNull(),
  suckerGroupId: text("sucker_group_id"),
  accountingToken: text("accounting_token").notNull(),
  accountingDecimals: integer("accounting_decimals").notNull(),
  accountingTokenSymbol: text("accounting_token_symbol").notNull(),
  erc20Symbol: text("erc20_symbol"),
  currentRulesetId: bigint("current_ruleset_id", { mode: "bigint" }).notNull(),
  erc20Supply: text("erc20_supply").notNull(),
});

export const onchainPayEvents = onchainSchema.table("pay_event", {
  chainId: integer("chain_id").notNull(),
  projectId: integer("project_id").notNull(),
  timestamp: integer("timestamp").notNull(),
  payer: text("payer").notNull(),
  amount: text("amount").notNull(),
  newlyIssuedTokenCount: text("newly_issued_token_count").notNull(),
  effectiveTokenCount: text("effective_token_count").notNull(),
  suckerGroupId: text("sucker_group_id"),
});

export const onchainParticipants = onchainSchema.table("participant", {
  chainId: integer("chain_id").notNull(),
  projectId: integer("project_id").notNull(),
  address: text("address").notNull(),
  balance: text("balance").notNull(),
  firstOwned: integer("first_owned"),
});

export const onchainRulesets = onchainSchema.table("ruleset", {
  chainId: integer("chain_id").notNull(),
  projectId: integer("project_id").notNull(),
  rulesetId: bigint("ruleset_id", { mode: "bigint" }).notNull(),
  start: bigint("start", { mode: "bigint" }).notNull(),
  weight: text("weight").notNull(),
  reservedPercent: integer("reserved_percent").notNull(),
  cashOutTaxRate: integer("cash_out_tax_rate").notNull(),
});

export const tokenMetadata = cobuildSchema.table("token_metadata", {
  chainId: integer("chain_id").notNull(),
  address: text("address").notNull(),
  priceUsdc: text("price_usdc"),
});

export type FarcasterProfile = typeof farcasterProfiles.$inferSelect;
export type FarcasterCast = typeof farcasterCasts.$inferSelect;
