import { bigint, integer, json, jsonb, pgSchema, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const cobuildSchema = pgSchema("cobuild");
const farcasterSchema = pgSchema("farcaster");

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
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  fid: bigint("fid", { mode: "number" }).primaryKey(),
});

export type FarcasterProfile = typeof farcasterProfiles.$inferSelect;
