import { bigint, index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { cobuildSchema } from "./shared";

export const cliOauthCodes = cobuildSchema.table(
  "cli_oauth_codes",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    codeHash: text("code_hash").notNull(),
    ownerAddress: text("owner_address").notNull(),
    agentKey: text("agent_key").notNull(),
    scope: text("scope").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => ({
    cliOauthCodesCodeHashUnique: uniqueIndex("cli_oauth_codes_code_hash_uq").on(
      table.codeHash,
    ),
    cliOauthCodesExpiresAtIdx: index("cli_oauth_codes_expires_at_idx").on(table.expiresAt),
  }),
);

export const cliSessions = cobuildSchema.table(
  "cli_cli_sessions",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    ownerAddress: text("owner_address").notNull(),
    agentKey: text("agent_key").notNull(),
    scope: text("scope").notNull(),
    label: text("label"),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    cliSessionsRefreshTokenHashUnique: uniqueIndex(
      "cli_cli_sessions_refresh_token_hash_uq",
    ).on(table.refreshTokenHash),
    cliSessionsOwnerRevokedIdx: index("cli_cli_sessions_owner_revoked_idx").on(
      table.ownerAddress,
      table.revokedAt,
    ),
    cliSessionsExpiresAtIdx: index("cli_cli_sessions_expires_at_idx").on(table.expiresAt),
  }),
);
