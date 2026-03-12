import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { chat } from "../../infra/db/schema";
import { cobuildDb } from "../../infra/db/cobuildDb";
import { getPublicError, toPublicErrorBody } from "../../public-errors";
import { getChatUserOrThrow } from "../auth/validate-chat-user";
import { parseChatCreateBody, parseChatData } from "./schema";

export async function handleChatCreateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const user = getChatUserOrThrow();
    const { type, data: inputData } = parseChatCreateBody(request.body);
    const data = parseChatData(inputData);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const chatId = randomUUID();
      const result = await cobuildDb
        .insert(chat)
        .values({
          id: chatId,
          type,
          data,
          user: user.address,
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: chat.id });

      if (result.length > 0) {
        return reply.send({ chatId });
      }
    }

    const error = getPublicError("chatCreateFailed");
    return reply.status(error.statusCode).send(toPublicErrorBody("chatCreateFailed"));
  } catch (error) {
    console.error("Chat create handler error:", error);
    throw error;
  }
}
