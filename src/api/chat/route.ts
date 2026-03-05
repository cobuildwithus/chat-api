import {
  type UIMessage,
  createUIMessageStreamResponse,
  convertToModelMessages,
  stepCountIs,
  streamText,
} from "ai";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { chat } from "../../infra/db/schema";
import { cobuildPrimaryDb } from "../../infra/db/cobuildDb";
import { getAgent } from "../../ai/agents/agent";
import { isAiUsageAvailable } from "../../ai/ai-rate.limit";
import type { ChatBody } from "../../ai/types";
import { isSameAddress } from "../../chat/address";
import { signChatGrant, verifyChatGrant } from "../../chat/grant";
import {
  clearPendingAssistantIfUnclaimed,
  markAssistantMessageFailed,
} from "../../chat/message-status";
import { storeChatMessages } from "../../chat/message-store";
import { isChatDebugEnabled } from "../../config/env";
import { getChatUserOrThrow } from "../auth/validate-chat-user";
import {
  CHAT_PERSIST_ERROR,
  buildStreamMessages,
  createReasoningTracker,
  fireAndForget,
  recordUsageIfPresent,
  resolveIsMobileRequest,
  streamErrorMessage,
} from "./chat-helpers";

export async function handleChatPostRequest(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const body = request.body as ChatBody;
    const { messages, type, context, data = {}, clientMessageId } = body;
    const includeCobuildAiContextPrompt = false;
    const user = getChatUserOrThrow();
    const chatId = body.id;
    const grantHeader = request.headers?.["x-chat-grant"];
    let issuedGrant: string | null = null;

    const validGrant =
      typeof grantHeader === "string"
        ? await verifyChatGrant(grantHeader)
        : null;

    const existing = await cobuildPrimaryDb()
      .select({ user: chat.user, type: chat.type })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!existing.length) {
      return reply.status(404).send({ error: "Chat not found" });
    }

    if (!isSameAddress(existing[0].user, user.address)) {
      return reply.status(404).send({ error: "Chat not found" });
    }

    if (existing[0].type !== type) {
      return reply.status(400).send({ error: "Chat type mismatch" });
    }

    const grantMatches =
      !!validGrant &&
      validGrant.cid === chatId &&
      isSameAddress(validGrant.sub, user.address);

    if (!grantMatches) {
      issuedGrant = await signChatGrant(chatId, user.address);
    }

    // Check the rate limit and build the agent in parallel.
    const [canUseAi, agent] = await Promise.all([
      isAiUsageAvailable(user.address),
      getAgent(type, user, data, undefined, { includeCobuildAiContextPrompt }),
    ]);

    if (!canUseAi) {
      if (issuedGrant) {
        reply.header?.("x-chat-grant", issuedGrant);
      }
      return reply
        .status(429)
        .send("Too many AI requests. Please try again in a few hours.");
    }

    const pendingAssistantId = randomUUID();
    const trustedAssistantIds = new Set([pendingAssistantId]);
    const pendingAssistantMessage = {
      id: pendingAssistantId,
      role: "assistant",
      parts: [],
      metadata: { pending: true },
    } satisfies UIMessage;

    try {
      await storeChatMessages({
        chatId,
        messages: [...messages, pendingAssistantMessage],
        type,
        data,
        user,
        clientMessageId,
        trustedMessageIds: [pendingAssistantId],
        generateTitle: false,
      });
    } catch (error) {
      console.error("Failed to store initial chat messages", {
        chatId,
        user: user.address,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error(CHAT_PERSIST_ERROR);
    }

    const modelMessages = await convertToModelMessages(messages);
    const streamMessages = buildStreamMessages(
      agent.system,
      modelMessages,
      context
    );
    const reasoningTracker = createReasoningTracker();

    const hasFileSearch = Object.prototype.hasOwnProperty.call(
      agent.tools,
      "file_search"
    );
    const isMobile = resolveIsMobileRequest(
      request.headers["x-client-device"],
      user.userAgent
    );
    const result = streamText({
      model: agent.defaultModel,
      messages: streamMessages,
      tools: agent.tools,
      providerOptions: {
        openai: {
          reasoningEffort: "medium",
          reasoningSummary: "auto",
          ...(isMobile ? { textVerbosity: "low" } : {}),
          ...(hasFileSearch ? { include: ["file_search_call.results"] } : {}),
        },
      },
      stopWhen: stepCountIs(7),
    });

    fireAndForget(recordUsageIfPresent(result.usage, user.address), "record AI usage");

    let usedPendingMessageId = false;
    const generateMessageId = () => {
      const generatedId = !usedPendingMessageId ? pendingAssistantId : randomUUID();
      if (!usedPendingMessageId) {
        usedPendingMessageId = true;
      }
      trustedAssistantIds.add(generatedId);
      return generatedId;
    };

    const uiStream = result.toUIMessageStream({
      originalMessages: messages,
      generateMessageId,
      sendReasoning: true,
      messageMetadata: ({ part }) => reasoningTracker.trackPart(part),
      onFinish: async ({ messages: finishedMessages }) => {
        try {
          await storeChatMessages({
            chatId,
            messages: finishedMessages,
            type,
            data,
            user,
            clientMessageId,
            trustedMessageIds: Array.from(trustedAssistantIds),
          });
          await clearPendingAssistantIfUnclaimed(
            chatId,
            pendingAssistantId,
            finishedMessages
          );
          if (isChatDebugEnabled()) {
            console.info("Stored chat messages", {
              chatId,
              messageCount: finishedMessages.length,
            });
          }
        } catch (error) {
          console.error("Failed to store chat messages", {
            chatId,
            user: user.address,
            message: error instanceof Error ? error.message : String(error),
          });
          throw new Error(CHAT_PERSIST_ERROR);
        }
      },
      onError: (error) => {
        const message = streamErrorMessage(error);
        fireAndForget(
          markAssistantMessageFailed(chatId, pendingAssistantId, message),
          "mark assistant message",
        );
        return message;
      },
    });
    const response = createUIMessageStreamResponse({
      stream: uiStream,
      ...(issuedGrant ? { headers: { "x-chat-grant": issuedGrant } } : {}),
    });
    fireAndForget(result.consumeStream(), "consume stream");
    return response;
  } catch (error) {
    console.error("Chat handler error:", error);
    throw error;
  }
}
