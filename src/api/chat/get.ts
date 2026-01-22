import type { UIMessage } from "ai";
import type { FastifyReply, FastifyRequest } from "fastify";
import { asc, eq } from "drizzle-orm";
import { chat, chatMessage } from "../../infra/db/schema";
import { cobuildDb } from "../../infra/db/cobuildDb";
import { isSameAddress } from "../../chat/address";
import { parseJson } from "../../chat/parse";
import { signChatGrant } from "../../chat/grant";
import { getChatUserOrThrow } from "../auth/validate-chat-user";

type ChatParams = {
  chatId: string;
};

type UiMessage = UIMessage<{ reasoningDurationMs?: number }>;

export async function handleChatGetRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const user = getChatUserOrThrow();
    const { chatId } = request.params as ChatParams;

    const existing = await cobuildDb
      .select({
        type: chat.type,
        data: chat.data,
        user: chat.user,
      })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!existing.length) {
      return reply.status(404).send({ error: "Chat not found" });
    }

    if (!isSameAddress(existing[0].user, user.address)) {
      return reply.status(404).send({ error: "Chat not found" });
    }

    const messageRows = await cobuildDb
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
    const chatGrant = await signChatGrant(chatId, user.address);

    reply.header("x-chat-grant", chatGrant);

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
