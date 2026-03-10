import { bigint, index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { cobuildSchema } from "./shared";

export const cliAgentWallets = cobuildSchema.table(
  "cli_agent_wallets",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    ownerAddress: text("owner_address").notNull(),
    agentKey: text("agent_key").notNull(),
    cdpAccountName: text("cdp_account_name").notNull(),
    address: text("address").notNull(),
    defaultNetwork: text("default_network").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    cliAgentWalletsOwnerAgentKeyUnique: uniqueIndex(
      "cli_agent_wallets_owner_agent_key_uidx",
    ).on(table.ownerAddress, table.agentKey),
    cliAgentWalletsCdpAccountNameUnique: uniqueIndex("cli_agent_wallets_cdp_account_name_uq").on(
      table.cdpAccountName,
    ),
    cliAgentWalletsOwnerIdx: index("cli_agent_wallets_owner_idx").on(table.ownerAddress),
  }),
);
