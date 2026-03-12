import type { UIMessage } from "ai";
import type { FastifyReply, FastifyRequest } from "fastify";
import { asc, eq } from "drizzle-orm";
import { chatMessage } from "../../infra/db/schema";
import { cobuildPrimaryDb } from "../../infra/db/cobuildDb";
import { getChatUserOrThrow } from "../auth/validate-chat-user";
import { readOwnedChat, replyWithChatNotFound } from "./owned-chat";
import { parseChatGetParams } from "./schema";

type UiMessage = UIMessage<{ reasoningDurationMs?: number }>;

export async function handleChatGetRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const user = getChatUserOrThrow();
    const { chatId } = parseChatGetParams(request.params);

    const existing = await readOwnedChat(chatId, user.address);
    if (!existing) {
      return replyWithChatNotFound(reply);
    }

    const messageRows = await cobuildPrimaryDb()
      .select({
        id: chatMessage.id,
        role: chatMessage.role,
        parts: chatMessage.parts,
        metadata: chatMessage.metadata,
      })
      .from(chatMessage)
      .where(eq(chatMessage.chatId, chatId))
      .orderBy(asc(chatMessage.position));

    const messages: UiMessage[] = messageRows.map((row) => ({
      id: row.id,
      role: row.role as UiMessage["role"],
      parts: Array.isArray(row.parts) ? row.parts : [],
      ...(isUiMetadata(row.metadata) ? { metadata: row.metadata } : {}),
    }));
    return reply.send({
      chatId,
      type: existing.type,
      data: existing.data,
      messages,
    });
  } catch (error) {
    console.error("Chat get handler error:", error);
    throw error;
  }
}

function isUiMetadata(metadata: unknown): metadata is UiMessage["metadata"] {
  return !!metadata && typeof metadata === "object";
}
