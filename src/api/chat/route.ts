import {
  type UIMessage,
  createUIMessageStreamResponse,
  convertToModelMessages,
  stepCountIs,
  streamText,
} from "ai";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { getAgent } from "../../ai/agents/agent";
import { admitAiGeneration } from "../../ai/ai-rate.limit";
import { CHAT_AGENT_TYPE } from "../../ai/types";
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
import { isChatDebugEnabled } from "../../config/env";
import { getPublicError, toPublicErrorBody } from "../../public-errors";
import { getChatUserOrThrow } from "../auth/validate-chat-user";
import type { SubjectWallet } from "../auth/principals";
import {
  CHAT_PERSIST_ERROR,
  buildStreamMessages,
  createReasoningTracker,
  resolveIsMobileRequest,
  streamErrorMessage,
} from "./chat-helpers";
import { readOwnedChat, replyWithChatNotFound } from "./owned-chat";
import { parseChatBody, parseChatHeaders } from "./schema";

type PreparedChatRequest = Awaited<ReturnType<typeof prepareChatRequestMessages>>;
type StreamResult = ReturnType<typeof streamText>;
type ChatAdmission = Extract<
  Awaited<ReturnType<typeof admitAiGeneration>>,
  { allowed: true }
>["admission"];

export async function handleChatPostRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const body = parseChatBody(request.body);
    const headers = parseChatHeaders(request.headers);
    const { attachments, chatId, clientMessageId, context, userMessage } = body;
    const user = getChatUserOrThrow();

    const existing = await loadOwnedChatForPost(chatId, user.address, reply);
    if (!existing) {
      return;
    }

    const preparedMessages = await prepareStoredRequestMessagesOrReply(
      {
        chatId,
        clientMessageId,
        userMessage,
        attachments,
        existingTitle: existing.title,
      },
      { chatId, userAddress: user.address },
      reply,
    );
    if (!preparedMessages) {
      return;
    }

    const agent = await getAgent(user, existing.data);
    const generation = await setupAdmittedGeneration({ chatId, userAddress: user.address }, reply);
    if (!generation) {
      return;
    }

    const lifecycle = createGenerationLifecycle({
      request,
      admission: generation.admission,
      chatId,
      userAddress: user.address,
      pendingAssistantId: generation.pendingAssistantId,
    });

    const result = await startChatStream({
      agent,
      context,
      headers,
      modelSourceMessages: preparedMessages.modelMessages,
      userAgent: user.userAgent,
      lifecycle,
      chatId,
      pendingAssistantId: generation.pendingAssistantId,
      releaseAdmission: generation.admission.release,
    });

    const reasoningTracker = createReasoningTracker();
    const uiStream = result.toUIMessageStream({
      originalMessages: preparedMessages.streamMessages,
      generateMessageId: createAssistantMessageIdGenerator(generation.pendingAssistantId),
      sendReasoning: true,
      messageMetadata: ({ part }) => reasoningTracker.trackPart(part),
      onFinish: async ({ messages: finishedMessages }) => {
        await finalizeChatGeneration({
          finishedMessages,
          storedStreamMessages: preparedMessages.streamMessages,
          result,
          lifecycle,
          chatId,
          pendingAssistantId: generation.pendingAssistantId,
          userAddress: user.address,
        });
      },
      onError: (error) => {
        const message = streamErrorMessage(error);
        lifecycle.settleGenerationInBackground({ chargeReservation: true });
        void Promise.resolve(
          markAssistantMessageFailed(chatId, generation.pendingAssistantId, message),
        );
        return message;
      },
    });

    return createUIMessageStreamResponse({ stream: uiStream });
  } catch (error) {
    console.error("Chat handler error:", error);
    throw error;
  }
}

async function loadOwnedChatForPost(
  chatId: string,
  userAddress: SubjectWallet,
  reply: FastifyReply,
) {
  const existing = await readOwnedChat(chatId, userAddress);
  if (!existing) {
    replyWithChatNotFound(reply);
    return null;
  }

  if (existing.type !== CHAT_AGENT_TYPE) {
    const error = getPublicError("chatTypeMismatch");
    reply.status(error.statusCode).send(toPublicErrorBody("chatTypeMismatch"));
    return null;
  }

  return existing;
}

async function prepareStoredRequestMessagesOrReply(
  input: Parameters<typeof prepareChatRequestMessages>[0],
  options: { chatId: string; userAddress: string },
  reply: FastifyReply,
): Promise<PreparedChatRequest | null> {
  try {
    return await prepareChatRequestMessages(input);
  } catch (error) {
    if (error instanceof InvalidChatRequestMessageError) {
      reply.status(400).send({ error: error.message });
      return null;
    }
    if (
      error instanceof ChatMessageInProgressError ||
      error instanceof ChatMessageAlreadyProcessedError
    ) {
      reply.status(409).send({ error: error.message });
      return null;
    }
    console.error("Failed to store initial user chat message", {
      chatId: options.chatId,
      user: options.userAddress,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error(CHAT_PERSIST_ERROR);
  }
}

async function setupAdmittedGeneration(
  options: { chatId: string; userAddress: string },
  reply: FastifyReply,
): Promise<{ admission: ChatAdmission; pendingAssistantId: string } | null> {
  const admissionResult = await admitAiGeneration(
    options.userAddress,
    options.chatId,
    randomUUID(),
  );

  if (!admissionResult.allowed) {
    if (admissionResult.code === "chat-inflight-limit") {
      reply.status(409).send({ error: "Another response is already in progress for this chat." });
      return null;
    }
    const error = getPublicError("chatRateLimited");
    reply.header("Retry-After", String(admissionResult.retryAfterSeconds));
    reply.status(error.statusCode).send(toPublicErrorBody("chatRateLimited"));
    return null;
  }

  const pendingAssistantId = randomUUID();
  try {
    await storePendingAssistantMessage(options.chatId, pendingAssistantId);
  } catch (error) {
    await admissionResult.admission.release();
    console.error("Failed to store pending assistant message", {
      chatId: options.chatId,
      user: options.userAddress,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error(CHAT_PERSIST_ERROR);
  }

  return {
    admission: admissionResult.admission,
    pendingAssistantId,
  };
}

async function storePendingAssistantMessage(chatId: string, pendingAssistantId: string) {
  const pendingAssistantMessage = {
    id: pendingAssistantId,
    role: "assistant",
    parts: [],
    metadata: { pending: true },
  } satisfies UIMessage;

  await storeAssistantMessages({
    chatId,
    messages: [pendingAssistantMessage],
    trustedMessageIds: [pendingAssistantId],
  });
}

function createGenerationLifecycle(options: {
  request: FastifyRequest;
  admission: ChatAdmission;
  chatId: string;
  userAddress: string;
  pendingAssistantId: string;
}) {
  const abortController = new AbortController();
  let settled = false;

  const handleDisconnect = () => {
    abortController.abort(new Error("Chat client disconnected"));
    void clearPendingAssistantIfUnclaimed(options.chatId, options.pendingAssistantId, []);
    settleGenerationInBackground({ chargeReservation: true });
  };

  const detachAbortListeners = () => {
    options.request.raw.off("aborted", handleDisconnect);
  };

  const settleGeneration = async (settleOptions: {
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
        typeof settleOptions.totalTokens === "number" &&
        Number.isFinite(settleOptions.totalTokens)
      ) {
        await options.admission.finalizeUsage(settleOptions.totalTokens);
      } else if (settleOptions.chargeReservation) {
        await options.admission.finalizeUsage(options.admission.reservedUsage);
      }
    } finally {
      await options.admission.release();
    }
  };

  const settleGenerationInBackground = (settleOptions: {
    totalTokens?: number;
    chargeReservation?: boolean;
  } = {}) => {
    void settleGeneration(settleOptions).catch((error) => {
      console.error("Failed to settle chat generation admission", {
        chatId: options.chatId,
        user: options.userAddress,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  };

  options.request.raw.once("aborted", handleDisconnect);

  return {
    abortController,
    detachAbortListeners,
    settleGeneration,
    settleGenerationInBackground,
  };
}

async function startChatStream(options: {
  agent: Awaited<ReturnType<typeof getAgent>>;
  context: string | undefined;
  headers: ReturnType<typeof parseChatHeaders>;
  modelSourceMessages: UIMessage[];
  userAgent: string | null;
  lifecycle: ReturnType<typeof createGenerationLifecycle>;
  chatId: string;
  pendingAssistantId: string;
  releaseAdmission: () => Promise<void>;
}): Promise<StreamResult> {
  try {
    const modelMessages = await convertToModelMessages(options.modelSourceMessages);
    const promptMessages = buildStreamMessages(
      options.agent.system,
      modelMessages,
      options.context,
    );
    const hasFileSearch = Object.prototype.hasOwnProperty.call(
      options.agent.tools,
      "file_search",
    );
    const isMobile = resolveIsMobileRequest(
      options.headers["x-client-device"],
      options.userAgent,
    );

    return streamText({
      model: options.agent.defaultModel,
      messages: promptMessages,
      tools: options.agent.tools,
      abortSignal: options.lifecycle.abortController.signal,
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
    options.lifecycle.detachAbortListeners();
    await clearPendingAssistantIfUnclaimed(
      options.chatId,
      options.pendingAssistantId,
      [],
    );
    await options.releaseAdmission();
    throw error;
  }
}

async function finalizeChatGeneration(options: {
  finishedMessages: UIMessage[];
  storedStreamMessages: UIMessage[];
  result: StreamResult;
  lifecycle: ReturnType<typeof createGenerationLifecycle>;
  chatId: string;
  pendingAssistantId: string;
  userAddress: string;
}) {
  try {
    const assistantMessages = collectFinishedAssistantMessages(
      options.finishedMessages,
      options.storedStreamMessages.length,
    );
    await storeAssistantMessages({
      chatId: options.chatId,
      messages: assistantMessages,
      trustedMessageIds: getTrustedAssistantMessageIds(assistantMessages),
    });
    await clearPendingAssistantIfUnclaimed(
      options.chatId,
      options.pendingAssistantId,
      assistantMessages,
    );

    const usage = await Promise.resolve(options.result.usage).catch(() => null);
    await options.lifecycle.settleGeneration({
      totalTokens: usage?.totalTokens,
      chargeReservation: true,
    });

    if (isChatDebugEnabled()) {
      console.info("Stored chat messages", {
        chatId: options.chatId,
        messageCount: options.storedStreamMessages.length + assistantMessages.length,
      });
    }
  } catch (error) {
    await options.lifecycle.settleGeneration({ chargeReservation: true });
    console.error("Failed to store chat messages", {
      chatId: options.chatId,
      user: options.userAddress,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error(CHAT_PERSIST_ERROR);
  }
}

function createAssistantMessageIdGenerator(pendingAssistantId: string) {
  let usedPendingMessageId = false;

  return () => {
    if (!usedPendingMessageId) {
      usedPendingMessageId = true;
      return pendingAssistantId;
    }
    return randomUUID();
  };
}

function collectFinishedAssistantMessages(
  finishedMessages: UIMessage[],
  storedMessageCount: number,
) {
  return finishedMessages
    .slice(storedMessageCount)
    .filter((message) => message.role === "assistant");
}

function getTrustedAssistantMessageIds(messages: UIMessage[]) {
  return Array.from(
    new Set(
      messages
        .map((message) => message.id)
        .filter((messageId): messageId is string => typeof messageId === "string"),
    ),
  );
}
