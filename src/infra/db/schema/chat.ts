import { integer, json, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { cobuildSchema } from "./shared";

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
