import type { FastifyReply, FastifyRequest } from "fastify";
import { desc, eq } from "drizzle-orm";
import { chat } from "../../infra/db/schema";
import { cobuildDb } from "../../infra/db/cobuildDb";
import { normalizeAddress } from "../../chat/address";
import { parseJson } from "../../chat/parse";
import { getChatUserOrThrow } from "../auth/validate-chat-user";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type ChatListQuery = {
  goalAddress?: string;
  limit?: string | number;
};

export async function handleChatListRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const user = getChatUserOrThrow();
    const { goalAddress, limit } = request.query as ChatListQuery;
    const resolvedLimit = Math.min(
      Math.max(Number(limit) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const normalizedGoal = normalizeAddress(goalAddress);

    const chats = await cobuildDb
      .select({
        id: chat.id,
        title: chat.title,
        data: chat.data,
        type: chat.type,
        updatedAt: chat.updatedAt,
        createdAt: chat.createdAt,
      })
      .from(chat)
      .where(eq(chat.user, user.address))
      .orderBy(desc(chat.updatedAt))
      .limit(resolvedLimit);

    const items = chats.flatMap((entry) => {
      if (normalizedGoal) {
        const data = parseJson(entry.data) as Record<string, unknown> | null;
        const entryGoal =
          typeof data?.goalAddress === "string" ? normalizeAddress(data.goalAddress) : null;
        if (!entryGoal || entryGoal !== normalizedGoal) return [];
      }

      return [
        {
          id: entry.id,
          title: entry.title ?? null,
          type: entry.type,
          updatedAt: entry.updatedAt.toISOString(),
          createdAt: entry.createdAt.toISOString(),
        },
      ];
    });

    return reply.send({ chats: items });
  } catch (error) {
    console.error("Chat list handler error:", error);
    throw error;
  }
}
