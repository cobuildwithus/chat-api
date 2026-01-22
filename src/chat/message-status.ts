import type { UIMessage } from "ai";
import { and, eq } from "drizzle-orm";
import { chatMessage } from "../infra/db/schema";
import { cobuildDb } from "../infra/db/cobuildDb";

export async function markAssistantMessageFailed(
  chatId: string,
  messageId: string,
  errorMessage: string,
) {
  await cobuildDb
    .update(chatMessage)
    .set({
      parts: [{ type: "text", text: errorMessage }],
      metadata: { error: true },
    })
    .where(and(eq(chatMessage.id, messageId), eq(chatMessage.chatId, chatId)));
}

export async function clearPendingAssistantIfUnclaimed(
  chatId: string,
  pendingAssistantId: string,
  finishedMessages: UIMessage[],
) {
  if (finishedMessages.some((message) => message.id === pendingAssistantId)) return;
  await cobuildDb
    .delete(chatMessage)
    .where(and(eq(chatMessage.id, pendingAssistantId), eq(chatMessage.chatId, chatId)));
}
