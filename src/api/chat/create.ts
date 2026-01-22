import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { chat } from "../../infra/db/schema";
import { cobuildDb } from "../../infra/db/cobuildDb";
import { signChatGrant } from "../../chat/grant";
import { getChatUserOrThrow } from "../auth/validate-chat-user";
import type { ChatData } from "../../ai/types";

type CreateChatBody = {
  type: string;
  data?: ChatData;
};

export async function handleChatCreateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const user = getChatUserOrThrow();
    const { type, data } = request.body as CreateChatBody;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const chatId = randomUUID();
      const result = await cobuildDb
        .insert(chat)
        .values({
          id: chatId,
          type,
          data: JSON.stringify(data ?? {}),
          user: user.address,
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: chat.id });

      if (result.length > 0) {
        const chatGrant = await signChatGrant(chatId, user.address);
        return reply.send({ chatId, chatGrant });
      }
    }

    return reply.status(500).send({ error: "Failed to create chat" });
  } catch (error) {
    console.error("Chat create handler error:", error);
    throw error;
  }
}
