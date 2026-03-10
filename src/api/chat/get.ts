import type { UIMessage } from "ai";
import type { FastifyReply, FastifyRequest } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { chat, chatMessage } from "../../infra/db/schema";
import { cobuildPrimaryDb } from "../../infra/db/cobuildDb";
import { parseJson } from "../../chat/parse";
import { getPublicError, toPublicErrorBody } from "../../public-errors";
import { getChatUserOrThrow } from "../auth/validate-chat-user";
import { parseChatGetParams } from "./schema";

type UiMessage = UIMessage<{ reasoningDurationMs?: number }>;

export async function handleChatGetRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const user = getChatUserOrThrow();
    const { chatId } = parseChatGetParams(request.params);

    const existing = await cobuildPrimaryDb()
      .select({
        type: chat.type,
        data: chat.data,
      })
      .from(chat)
      .where(and(eq(chat.id, chatId), eq(chat.user, user.address)))
      .limit(1);

    if (!existing.length) {
      const error = getPublicError("chatNotFound");
      return reply.status(error.statusCode).send(toPublicErrorBody("chatNotFound"));
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
    const data = parseJson(existing[0].data) ?? {};

    return reply.send({
      chatId,
      type: existing[0].type,
      data,
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
