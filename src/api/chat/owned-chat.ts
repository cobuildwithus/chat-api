import { isSameEvmAddress } from "@cobuild/wire";
import type { FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import type { ChatData } from "../../ai/types";
import { parseJson } from "../../chat/parse";
import { cobuildPrimaryDb } from "../../infra/db/cobuildDb";
import { chat } from "../../infra/db/schema";
import { getPublicError, toPublicErrorBody } from "../../public-errors";
import { parseChatData } from "./schema";

export type OwnedChatRecord = {
  user: string;
  type: string;
  data: ChatData;
  title: string | null;
};

export async function readOwnedChat(
  chatId: string,
  ownerAddress: string,
): Promise<OwnedChatRecord | null> {
  const rows = await cobuildPrimaryDb()
    .select({
      user: chat.user,
      type: chat.type,
      data: chat.data,
      title: chat.title,
    })
    .from(chat)
    .where(eq(chat.id, chatId))
    .limit(1);

  const row = rows[0];
  if (!row || !isSameEvmAddress(row.user, ownerAddress)) {
    return null;
  }

  return {
    user: row.user,
    type: row.type,
    data: parseChatData(parseJson(row.data)),
    title: row.title ?? null,
  };
}

export function replyWithChatNotFound(reply: FastifyReply) {
  const error = getPublicError("chatNotFound");
  return reply.status(error.statusCode).send(toPublicErrorBody("chatNotFound"));
}
