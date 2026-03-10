import {
  type UIMessage,
  createUIMessageStreamResponse,
  convertToModelMessages,
  stepCountIs,
  streamText,
} from "ai";
import { isSameEvmAddress } from "@cobuild/wire";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { AgentType } from "../../ai/agents/agent";
import { getAgent } from "../../ai/agents/agent";
import { admitAiGeneration } from "../../ai/ai-rate.limit";
import type { ChatData } from "../../ai/types";
import {
  ChatMessageAlreadyProcessedError,
  ChatMessageInProgressError,
  InvalidChatRequestMessageError,
  prepareChatRequestMessages,
  storeAssistantMessages,
} from "../../chat/message-store";
import {
  clearPendingAssistantIfUnclaimed,
  markAssistantMessageFailed,
} from "../../chat/message-status";
import { parseJson } from "../../chat/parse";
import { isChatDebugEnabled } from "../../config/env";
import { chat } from "../../infra/db/schema";
import { cobuildPrimaryDb } from "../../infra/db/cobuildDb";
import { getPublicError, toPublicErrorBody } from "../../public-errors";
import { getChatUserOrThrow } from "../auth/validate-chat-user";
import {
  CHAT_PERSIST_ERROR,
  buildStreamMessages,
  createReasoningTracker,
  resolveIsMobileRequest,
  streamErrorMessage,
} from "./chat-helpers";
import { parseChatBody, parseChatHeaders } from "./schema";

export async function handleChatPostRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const body = parseChatBody(request.body);
    const headers = parseChatHeaders(request.headers);
    const { attachments, chatId, clientMessageId, context, userMessage } = body;
    const user = getChatUserOrThrow();

    const existing = await cobuildPrimaryDb()
      .select({
        user: chat.user,
        type: chat.type,
        data: chat.data,
        title: chat.title,
      })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!existing.length) {
      const error = getPublicError("chatNotFound");
      return reply.status(error.statusCode).send(toPublicErrorBody("chatNotFound"));
    }

    if (!isSameEvmAddress(existing[0].user, user.address)) {
      const error = getPublicError("chatNotFound");
      return reply.status(error.statusCode).send(toPublicErrorBody("chatNotFound"));
    }

    if (existing[0].type !== "chat-default") {
      const error = getPublicError("chatTypeMismatch");
      return reply.status(error.statusCode).send(toPublicErrorBody("chatTypeMismatch"));
    }

    let storedStreamMessages: UIMessage[] = [];
    let modelSourceMessages: UIMessage[] = [];
    try {
      const preparedMessages = await prepareChatRequestMessages({
        chatId,
        clientMessageId,
        userMessage,
        attachments,
        existingTitle: existing[0].title ?? null,
      });
      storedStreamMessages = preparedMessages.streamMessages;
      modelSourceMessages = preparedMessages.modelMessages;
    } catch (error) {
      if (error instanceof InvalidChatRequestMessageError) {
        return reply.status(400).send({ error: error.message });
      }
      if (error instanceof ChatMessageInProgressError) {
        return reply.status(409).send({ error: error.message });
      }
      if (error instanceof ChatMessageAlreadyProcessedError) {
        return reply.status(409).send({ error: error.message });
      }
      console.error("Failed to store initial user chat message", {
        chatId,
        user: user.address,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error(CHAT_PERSIST_ERROR);
    }

    const type: AgentType = "chat-default";
    const data = normalizeChatData(parseJson(existing[0].data));
    const agent = await getAgent(type, user, data);
    const requestLeaseId = randomUUID();
    const admissionResult = await admitAiGeneration(user.address, chatId, requestLeaseId);

    if (!admissionResult.allowed) {
      if (admissionResult.code === "chat-inflight-limit") {
        return reply.status(409).send({ error: "Another response is already in progress for this chat." });
      }
      const error = getPublicError("chatRateLimited");
      reply.header("Retry-After", String(admissionResult.retryAfterSeconds));
      return reply.status(error.statusCode).send(toPublicErrorBody("chatRateLimited"));
    }
    const admission = admissionResult.admission;

    const pendingAssistantId = randomUUID();
    const trustedAssistantIds = new Set([pendingAssistantId]);
    const pendingAssistantMessage = {
      id: pendingAssistantId,
      role: "assistant",
      parts: [],
      metadata: { pending: true },
    } satisfies UIMessage;

    try {
      await storeAssistantMessages({
        chatId,
        messages: [pendingAssistantMessage],
        trustedMessageIds: [pendingAssistantId],
      });
    } catch (error) {
      await admission.release();
      console.error("Failed to store pending assistant message", {
        chatId,
        user: user.address,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error(CHAT_PERSIST_ERROR);
    }

    const abortController = new AbortController();
    let settled = false;
    const settleGeneration = async (options: {
      totalTokens?: number;
      chargeReservation?: boolean;
    } = {}) => {
      if (settled) {
        return;
      }
      settled = true;
      detachAbortListeners();
      try {
        if (
          typeof options.totalTokens === "number" &&
          Number.isFinite(options.totalTokens)
        ) {
          await admission.finalizeUsage(options.totalTokens);
        } else if (options.chargeReservation) {
          await admission.finalizeUsage(admission.reservedUsage);
        }
      } finally {
        await admission.release();
      }
    };

    const settleGenerationInBackground = (options: {
      totalTokens?: number;
      chargeReservation?: boolean;
    } = {}) => {
      void settleGeneration(options).catch((error) => {
        console.error("Failed to settle chat generation admission", {
          chatId,
          user: user.address,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    };

    const handleDisconnect = () => {
      abortController.abort(new Error("Chat client disconnected"));
      void clearPendingAssistantIfUnclaimed(chatId, pendingAssistantId, []);
      settleGenerationInBackground({ chargeReservation: true });
    };

    const detachAbortListeners = () => {
      request.raw.off("aborted", handleDisconnect);
    };

    request.raw.once("aborted", handleDisconnect);

    const modelMessages = await convertToModelMessages(modelSourceMessages);
    const promptMessages = buildStreamMessages(agent.system, modelMessages, context);
    const reasoningTracker = createReasoningTracker();

    const hasFileSearch = Object.prototype.hasOwnProperty.call(agent.tools, "file_search");
    const isMobile = resolveIsMobileRequest(headers["x-client-device"], user.userAgent);
    let result: ReturnType<typeof streamText>;
    try {
      result = streamText({
        model: agent.defaultModel,
        messages: promptMessages,
        tools: agent.tools,
        abortSignal: abortController.signal,
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
    } catch (error) {
      detachAbortListeners();
      await clearPendingAssistantIfUnclaimed(chatId, pendingAssistantId, []);
      await admission.release();
      throw error;
    }

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
      originalMessages: storedStreamMessages,
      generateMessageId,
      sendReasoning: true,
      messageMetadata: ({ part }) => reasoningTracker.trackPart(part),
      onFinish: async ({ messages: finishedMessages }) => {
        try {
          const assistantMessages = finishedMessages
            .slice(storedStreamMessages.length)
            .filter((message) => message.role === "assistant");
          await storeAssistantMessages({
            chatId,
            messages: assistantMessages,
            trustedMessageIds: Array.from(trustedAssistantIds),
          });
          await clearPendingAssistantIfUnclaimed(chatId, pendingAssistantId, assistantMessages);
          const usage = await Promise.resolve(result.usage).catch(() => null);
          await settleGeneration({
            totalTokens: usage?.totalTokens,
            chargeReservation: true,
          });
          if (isChatDebugEnabled()) {
            console.info("Stored chat messages", {
              chatId,
              messageCount: storedStreamMessages.length + assistantMessages.length,
            });
          }
        } catch (error) {
          await settleGeneration({ chargeReservation: true });
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
        settleGenerationInBackground({ chargeReservation: true });
        void Promise.resolve(
          markAssistantMessageFailed(chatId, pendingAssistantId, message),
        );
        return message;
      },
    });
    const response = createUIMessageStreamResponse({
      stream: uiStream,
    });
    return response;
  } catch (error) {
    console.error("Chat handler error:", error);
    throw error;
  }
}

function normalizeChatData(value: unknown): ChatData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.goalAddress === "string" ? { goalAddress: record.goalAddress } : {}),
    ...(typeof record.grantId === "string" ? { grantId: record.grantId } : {}),
    ...(typeof record.impactId === "string" ? { impactId: record.impactId } : {}),
    ...(typeof record.castId === "string" ? { castId: record.castId } : {}),
    ...(typeof record.opportunityId === "string"
      ? { opportunityId: record.opportunityId }
      : {}),
    ...(typeof record.startupId === "string" ? { startupId: record.startupId } : {}),
    ...(typeof record.draftId === "string" ? { draftId: record.draftId } : {}),
  };
}
