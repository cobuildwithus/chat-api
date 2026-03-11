import type { FastifyReply, FastifyRequest } from "fastify";
import { desc, eq } from "drizzle-orm";
import { chat } from "../../infra/db/schema";
import { cobuildPrimaryDb } from "../../infra/db/cobuildDb";
import { getChatUserOrThrow } from "../auth/validate-chat-user";
import { parseChatListQuery } from "./schema";

const DEFAULT_LIMIT = 50;

export async function handleChatListRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const user = getChatUserOrThrow();
    const { limit } = parseChatListQuery(request.query);
    const resolvedLimit = limit ?? DEFAULT_LIMIT;

    const chats = await cobuildPrimaryDb()
      .select({
        id: chat.id,
        title: chat.title,
        type: chat.type,
        updatedAt: chat.updatedAt,
        createdAt: chat.createdAt,
      })
      .from(chat)
      .where(eq(chat.user, user.address))
      .orderBy(desc(chat.updatedAt))
      .limit(resolvedLimit);

    const items = chats.map((entry) => ({
      id: entry.id,
      title: entry.title ?? null,
      type: entry.type,
      updatedAt: entry.updatedAt.toISOString(),
      createdAt: entry.createdAt.toISOString(),
    }));

    return reply.send({ chats: items });
  } catch (error) {
    console.error("Chat list handler error:", error);
    throw error;
  }
}
