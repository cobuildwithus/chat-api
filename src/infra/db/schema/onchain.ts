import { bigint, integer, text } from "drizzle-orm/pg-core";
import { cobuildSchema, onchainSchema } from "./shared";

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
  duration: bigint("duration", { mode: "bigint" }).notNull(),
  weight: text("weight").notNull(),
  weightCutPercent: integer("weight_cut_percent").notNull(),
  reservedPercent: integer("reserved_percent").notNull(),
  cashOutTaxRate: integer("cash_out_tax_rate").notNull(),
});

export const tokenMetadata = cobuildSchema.table("token_metadata", {
  chainId: integer("chain_id").notNull(),
  address: text("address").notNull(),
  priceUsdc: text("price_usdc"),
});
