import type { UIMessage } from "ai";
import { and, eq, inArray, isNull, not, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { ChatData, ChatUser } from "../ai/types";
import { chat, chatMessage } from "../infra/db/schema";
import { cobuildDb } from "../infra/db/cobuildDb";
import { generateChatTitle } from "./generate-title";
import { getFirstUserText } from "./message-text";

type StoreChatMessagesArgs = {
  chatId: string;
  messages: UIMessage[];
  type: string;
  data?: ChatData;
  user: ChatUser;
  clientMessageId?: string;
  generateTitle?: boolean;
};

export async function storeChatMessages({
  chatId,
  messages,
  type,
  data,
  user,
  clientMessageId,
  generateTitle = true,
}: StoreChatMessagesArgs) {
  const primaryDb = cobuildDb.$primary ?? cobuildDb;
  const now = new Date();
  const serializedData = JSON.stringify(data ?? {});

  await cobuildDb
    .insert(chat)
    .values({
      id: chatId,
      type,
      data: serializedData,
      user: user.address,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: chat.id,
      set: {
        type,
        data: serializedData,
        user: user.address,
        updatedAt: now,
      },
    });

  if (messages.length === 0) {
    await cobuildDb.delete(chatMessage).where(eq(chatMessage.chatId, chatId));
    if (generateTitle) {
      const [storedChat] = await primaryDb
        .select({ title: chat.title })
        .from(chat)
        .where(eq(chat.id, chatId))
        .limit(1);
      await maybeSetConversationTitle(chatId, storedChat?.title ?? null, messages);
    }
    return;
  }

  const existing = await cobuildDb
    .select({
      id: chatMessage.id,
      clientId: chatMessage.clientId,
      createdAt: chatMessage.createdAt,
    })
    .from(chatMessage)
    .where(eq(chatMessage.chatId, chatId));
  const existingById = new Map<string, { createdAt: Date; clientId: string | null }>();
  const existingByClientId = new Map<
    string,
    { id: string; createdAt: Date; clientId: string | null }
  >();
  for (const row of existing) {
    existingById.set(row.id, { createdAt: row.createdAt, clientId: row.clientId });
    if (row.clientId) {
      existingByClientId.set(row.clientId, {
        id: row.id,
        createdAt: row.createdAt,
        clientId: row.clientId,
      });
    }
  }
  const fallbackCreatedAt = new Date();
  const lastUserIndex = messages.reduce(
    (lastIndex, message, index) => (message.role === "user" ? index : lastIndex),
    -1,
  );
  const requestedClientId = clientMessageId?.trim() || null;

  const rows = messages.map((message, index) => {
    const isUserMessage = message.role === "user";
    const messageId = message.id ?? null;
    const incomingClientId =
      isUserMessage && index === lastUserIndex && requestedClientId ? requestedClientId : null;
    const existingRowById = messageId ? existingById.get(messageId) : undefined;
    const clientLookupId = messageId || incomingClientId;
    const existingRowByClientId = clientLookupId
      ? existingByClientId.get(clientLookupId)
      : undefined;
    let id: string;
    let resolvedClientId: string | null = null;
    let createdAt = fallbackCreatedAt;

    if (existingRowById) {
      id = messageId!;
      resolvedClientId = isUserMessage ? existingRowById.clientId ?? incomingClientId : null;
      createdAt = existingRowById.createdAt;
    } else if (existingRowByClientId) {
      id = existingRowByClientId.id;
      resolvedClientId = existingRowByClientId.clientId ?? null;
      createdAt = existingRowByClientId.createdAt;
    } else if (isUserMessage) {
      id = randomUUID();
      resolvedClientId = incomingClientId ?? messageId;
    } else {
      id = messageId ?? randomUUID();
    }

    return {
      id,
      chatId,
      clientId: resolvedClientId,
      role: message.role,
      parts: message.parts,
      metadata: message.metadata ?? null,
      position: index,
      createdAt,
    };
  });

  const ids = rows.map((row) => row.id);
  await cobuildDb
    .insert(chatMessage)
    .values(rows)
    .onConflictDoUpdate({
      target: chatMessage.id,
      set: {
        clientId: sql`coalesce(excluded."clientId", ${chatMessage.clientId})`,
        role: sql`excluded.role`,
        parts: sql`excluded.parts`,
        metadata: sql`excluded.metadata`,
        position: sql`excluded.position`,
      },
    });

  await cobuildDb
    .delete(chatMessage)
    .where(and(eq(chatMessage.chatId, chatId), not(inArray(chatMessage.id, ids))));

  if (generateTitle) {
    const [storedChat] = await primaryDb
      .select({ title: chat.title })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);
    await maybeSetConversationTitle(chatId, storedChat?.title ?? null, messages);
  }
}

async function maybeSetConversationTitle(
  chatId: string,
  existingTitle: string | null,
  messages: UIMessage[],
) {
  if (existingTitle) return;

  const firstUserMessage = getFirstUserText(messages);
  if (!firstUserMessage) {
    console.info(`Skipping title generation for ${chatId}: no user message found.`);
    return;
  }

  try {
    console.info(
      `Generating title for ${chatId} from first user message (length ${firstUserMessage.length}).`,
    );
    const title = await generateChatTitle(firstUserMessage);
    if (!title) {
      console.info(`Title generation returned empty for ${chatId}.`);
      return;
    }

    await cobuildDb
      .update(chat)
      .set({ title })
      .where(and(eq(chat.id, chatId), isNull(chat.title)));
    console.info(`Stored title for ${chatId}: "${title}".`);
  } catch (error) {
    console.error("Failed to store chat title", error);
  }
}
