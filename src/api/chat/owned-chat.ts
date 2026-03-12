import type { FastifyReply } from "fastify";
import { and, eq } from "drizzle-orm";
import type { ChatData } from "../../ai/types";
import { parseJson } from "../../chat/parse";
import { cobuildPrimaryDb } from "../../infra/db/cobuildDb";
import { chat } from "../../infra/db/schema";
import { getPublicError, toPublicErrorBody } from "../../public-errors";
import type { SubjectWallet } from "../auth/principals";
import { parseChatData } from "./schema";

export type OwnedChatRecord = {
  type: string;
  data: ChatData;
  title: string | null;
};

export async function readOwnedChat(
  chatId: string,
  ownerAddress: SubjectWallet,
): Promise<OwnedChatRecord | null> {
  const rows = await cobuildPrimaryDb()
    .select({
      type: chat.type,
      data: chat.data,
      title: chat.title,
    })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.user, ownerAddress)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    type: row.type,
    data: parseChatData(parseJson(row.data)),
    title: row.title ?? null,
  };
}

export function replyWithChatNotFound(reply: FastifyReply) {
  const error = getPublicError("chatNotFound");
  return reply.status(error.statusCode).send(toPublicErrorBody("chatNotFound"));
}
