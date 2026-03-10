import type { UIMessage } from "ai";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { ChatAttachment } from "../ai/types";
import { chat, chatMessage } from "../infra/db/schema";
import { cobuildPrimaryDb } from "../infra/db/cobuildDb";
import { generateChatTitle } from "./generate-title";
import { getFirstUserText } from "./message-text";

type ChatMessageRow = {
  id: string;
  clientId: string | null;
  role: string;
  parts: unknown;
  metadata: unknown;
  position: number;
  createdAt: Date;
};

type PrimaryDb = ReturnType<typeof cobuildPrimaryDb>;
type ChatDb = Pick<PrimaryDb, "execute" | "insert" | "select" | "update">;

type PrepareChatRequestMessagesArgs = {
  chatId: string;
  clientMessageId: string;
  userMessage: string;
  attachments?: ChatAttachment[];
  existingTitle: string | null;
};

type StoreAssistantMessagesArgs = {
  chatId: string;
  messages: UIMessage[];
  trustedMessageIds?: string[];
};

type PreparedChatRequestMessages = {
  streamMessages: UIMessage[];
  modelMessages: UIMessage[];
};

export class InvalidChatRequestMessageError extends Error {}

export class ChatMessageAlreadyProcessedError extends Error {}

export class ChatMessageInProgressError extends ChatMessageAlreadyProcessedError {}

export async function prepareChatRequestMessages({
  chatId,
  clientMessageId,
  userMessage,
  attachments = [],
  existingTitle,
}: PrepareChatRequestMessagesArgs): Promise<PreparedChatRequestMessages> {
  const primaryDb = cobuildPrimaryDb();
  const normalizedClientMessageId = clientMessageId.trim();
  const normalizedText = userMessage.trim();
  const userParts = buildUserMessageParts(normalizedText, attachments);
  const newUserMessageId = randomUUID();

  let streamMessages: UIMessage[] = [];
  let modelMessages: UIMessage[] = [];

  await primaryDb.transaction(async (tx) => {
    await lockChat(tx, chatId);

    const storedRows = await loadStoredChatRows(tx, chatId);
    const existingUserRow = storedRows.find((row) => row.clientId === normalizedClientMessageId) ?? null;

    streamMessages = rowsToUiMessages(storedRows.filter((row) => !isPendingAssistantRow(row)));
    modelMessages = rowsToUiMessages(storedRows.filter((row) => !isEphemeralAssistantRow(row)));

    if (existingUserRow) {
      if (existingUserRow.role !== "user") {
        throw new InvalidChatRequestMessageError("clientMessageId already belongs to a non-user message.");
      }
      if (!partsEqual(existingUserRow.parts, userParts)) {
        throw new InvalidChatRequestMessageError(
          "clientMessageId already belongs to a different user message.",
        );
      }

      const followingRows = storedRows.filter((row) => row.position > existingUserRow.position);
      if (followingRows.some((row) => row.role === "user")) {
        throw new ChatMessageAlreadyProcessedError("Message already processed.");
      }
      if (followingRows.some((row) => isPendingAssistantRow(row))) {
        throw new ChatMessageInProgressError("Message already in progress.");
      }
      if (followingRows.some((row) => isCompletedAssistantRow(row))) {
        throw new ChatMessageAlreadyProcessedError("Message already processed.");
      }
    } else {
      if (storedRows.some((row) => isPendingAssistantRow(row))) {
        throw new ChatMessageInProgressError(
          "Another response is already in progress for this chat.",
        );
      }
      const nextPosition = getNextPosition(storedRows);
      const newUserRow = {
        id: newUserMessageId,
        chatId,
        clientId: normalizedClientMessageId,
        role: "user",
        parts: userParts,
        metadata: null,
        position: nextPosition,
        createdAt: new Date(),
      };

      await tx.insert(chatMessage).values(newUserRow);
      await tx
        .update(chat)
        .set({ updatedAt: new Date() })
        .where(eq(chat.id, chatId));

      const uiMessage = rowToUiMessage(newUserRow);
      streamMessages = [...streamMessages, uiMessage];
      modelMessages = [...modelMessages, uiMessage];
    }
  });

  await maybeSetConversationTitle(chatId, existingTitle, streamMessages);

  return { streamMessages, modelMessages };
}

export async function storeAssistantMessages({
  chatId,
  messages,
  trustedMessageIds = [],
}: StoreAssistantMessagesArgs): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  const trustedIds = new Set(
    trustedMessageIds
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  const primaryDb = cobuildPrimaryDb();

  await primaryDb.transaction(async (tx) => {
    await lockChat(tx, chatId);

    const storedRows = await loadStoredChatRows(tx, chatId);
    const existingById = new Map(storedRows.map((row) => [row.id, row]));
    let nextPosition = getNextPosition(storedRows);

    for (const message of messages) {
      const messageId = message.id?.trim();
      if (!messageId) {
        throw new InvalidChatRequestMessageError("Assistant messages must include an id.");
      }
      if (message.role !== "assistant") {
        throw new InvalidChatRequestMessageError("Only assistant messages can be stored.");
      }
      if (!trustedIds.has(messageId)) {
        throw new InvalidChatRequestMessageError("Untrusted assistant message id.");
      }

      const existingRow = existingById.get(messageId) ?? null;
      const position = existingRow?.position ?? nextPosition;
      nextPosition = Math.max(nextPosition, position + 1);

      await tx
        .insert(chatMessage)
        .values({
          id: messageId,
          chatId,
          clientId: null,
          role: "assistant",
          parts: message.parts,
          metadata: message.metadata ?? null,
          position,
          createdAt: existingRow?.createdAt ?? new Date(),
        })
        .onConflictDoUpdate({
          target: chatMessage.id,
          set: {
            role: "assistant",
            parts: message.parts,
            metadata: message.metadata ?? null,
            position,
          },
        });
    }

    await tx
      .update(chat)
      .set({ updatedAt: new Date() })
      .where(eq(chat.id, chatId));
  });
}

async function loadStoredChatRows(db: ChatDb, chatId: string): Promise<ChatMessageRow[]> {
  return (await db
    .select({
      id: chatMessage.id,
      clientId: chatMessage.clientId,
      role: chatMessage.role,
      parts: chatMessage.parts,
      metadata: chatMessage.metadata,
      position: chatMessage.position,
      createdAt: chatMessage.createdAt,
    })
    .from(chatMessage)
    .where(eq(chatMessage.chatId, chatId))
    .orderBy(asc(chatMessage.position))) as ChatMessageRow[];
}

async function lockChat(db: Pick<ChatDb, "execute">, chatId: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${chatId}))`);
}

function buildUserMessageParts(text: string, attachments: ChatAttachment[]): UIMessage["parts"] {
  const parts: UIMessage["parts"] = [];

  if (text.length > 0) {
    parts.push({ type: "text", text });
  }

  for (const attachment of attachments) {
    if (attachment.type === "file") {
      parts.push({
        type: "file",
        url: attachment.url,
        mediaType: attachment.mediaType,
        ...(attachment.filename ? { filename: attachment.filename } : {}),
        ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
        ...(attachment.name ? { name: attachment.name } : {}),
      });
      continue;
    }

    parts.push({
      type: "file",
      url: attachment.image,
      mediaType: attachment.mimeType ?? "image/*",
      ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
    });
  }

  if (parts.length === 0) {
    throw new InvalidChatRequestMessageError(
      "Chat requests must include text or at least one attachment.",
    );
  }

  return parts;
}

function getNextPosition(rows: Pick<ChatMessageRow, "position">[]): number {
  return rows.reduce((maxPosition, row) => Math.max(maxPosition, row.position), -1) + 1;
}

function isMetadataObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPendingAssistantRow(row: Pick<ChatMessageRow, "role" | "metadata">): boolean {
  return row.role === "assistant" && isMetadataObject(row.metadata) && row.metadata.pending === true;
}

function isErrorAssistantRow(row: Pick<ChatMessageRow, "role" | "metadata">): boolean {
  return row.role === "assistant" && isMetadataObject(row.metadata) && row.metadata.error === true;
}

function isCompletedAssistantRow(row: Pick<ChatMessageRow, "role" | "metadata">): boolean {
  return row.role === "assistant" && !isPendingAssistantRow(row) && !isErrorAssistantRow(row);
}

function isEphemeralAssistantRow(row: Pick<ChatMessageRow, "role" | "metadata">): boolean {
  return isPendingAssistantRow(row) || isErrorAssistantRow(row);
}

function rowToUiMessage(row: Pick<ChatMessageRow, "id" | "role" | "parts" | "metadata">): UIMessage {
  return {
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: Array.isArray(row.parts) ? (row.parts as UIMessage["parts"]) : [],
    ...(isMetadataObject(row.metadata) ? { metadata: row.metadata } : {}),
  };
}

function rowsToUiMessages(rows: ChatMessageRow[]): UIMessage[] {
  return rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map(rowToUiMessage);
}

function partsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
    const title = await generateChatTitle(firstUserMessage);
    if (!title) {
      return;
    }

    await cobuildPrimaryDb()
      .update(chat)
      .set({ title })
      .where(and(eq(chat.id, chatId), isNull(chat.title)));
  } catch (error) {
    console.error("Failed to store chat title", error);
  }
}
