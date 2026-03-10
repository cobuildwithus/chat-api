import { convertToModelMessages, streamText, tool } from "ai";
import type {
  FilePart,
  ImagePart,
  LanguageModel,
  ModelMessage,
  TextPart,
} from "ai";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { handleChatPostRequest } from "../../../src/api/chat/route";
import { getAgent } from "../../../src/ai/agents/agent";
import { admitAiGeneration } from "../../../src/ai/ai-rate.limit";
import { getChatUserOrThrow } from "../../../src/api/auth/validate-chat-user";
import {
  ChatMessageAlreadyProcessedError,
  ChatMessageInProgressError,
  InvalidChatRequestMessageError,
  prepareChatRequestMessages,
  storeAssistantMessages,
} from "../../../src/chat/message-store";
import {
  clearPendingAssistantIfUnclaimed,
  markAssistantMessageFailed,
} from "../../../src/chat/message-status";
import { chat } from "../../../src/infra/db/schema";
import { isChatDebugEnabled } from "../../../src/config/env";
import { CHAT_PERSIST_ERROR } from "../../../src/api/chat/chat-helpers";
import type { ChatRequestBody } from "../../../src/api/chat/schema";
import { createReply } from "../../utils/fastify";
import { buildChatUser } from "../../utils/fixtures/chat-user";
import { resetAllMocks, setCobuildDbResponse } from "../../utils/mocks/db";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    streamText: vi.fn(),
    convertToModelMessages: vi.fn(),
  };
});

vi.mock("../../../src/ai/agents/agent", () => ({
  getAgent: vi.fn(),
}));

vi.mock("../../../src/ai/ai-rate.limit", () => ({
  admitAiGeneration: vi.fn(),
}));

vi.mock("../../../src/api/auth/validate-chat-user", () => ({
  getChatUserOrThrow: vi.fn(),
}));

vi.mock("../../../src/chat/message-store", () => ({
  prepareChatRequestMessages: vi.fn(),
  storeAssistantMessages: vi.fn(),
  InvalidChatRequestMessageError: class InvalidChatRequestMessageError extends Error {},
  ChatMessageAlreadyProcessedError: class ChatMessageAlreadyProcessedError extends Error {},
  ChatMessageInProgressError: class ChatMessageInProgressError extends Error {},
}));

vi.mock("../../../src/chat/message-status", () => ({
  clearPendingAssistantIfUnclaimed: vi.fn(),
  markAssistantMessageFailed: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(),
}));

vi.mock("../../../src/config/env", () => ({
  isChatDebugEnabled: vi.fn(() => false),
}));

const streamTextMock = vi.mocked(streamText);
const convertToModelMessagesMock = vi.mocked(convertToModelMessages);
const getAgentMock = vi.mocked(getAgent);
const admitAiGenerationMock = vi.mocked(admitAiGeneration);
const getChatUserOrThrowMock = vi.mocked(getChatUserOrThrow);
const prepareChatRequestMessagesMock = vi.mocked(prepareChatRequestMessages);
const storeAssistantMessagesMock = vi.mocked(storeAssistantMessages);
const markAssistantMessageFailedMock = vi.mocked(markAssistantMessageFailed);
const clearPendingAssistantIfUnclaimedMock = vi.mocked(clearPendingAssistantIfUnclaimed);
const isChatDebugEnabledMock = vi.mocked(isChatDebugEnabled);
const randomUUIDMock = vi.mocked(randomUUID);

let mockModel: LanguageModel;
type MockFn = ReturnType<typeof vi.fn>;
type MockFastifyRequest = FastifyRequest<{ Body: ChatRequestBody }> & {
  raw: {
    once: MockFn;
    off: MockFn;
  };
};

const buildRequest = (
  body: ChatRequestBody,
  headers: Record<string, string> = {},
): MockFastifyRequest =>
  ({
    body,
    headers,
    raw: {
      once: vi.fn(),
      off: vi.fn(),
    },
  }) as unknown as MockFastifyRequest;

const baseBody: ChatRequestBody = {
  chatId: "chat-1",
  clientMessageId: "client-1",
  userMessage: "hello",
};

const baseUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 1200,
  inputTokenDetails: {
    noCacheTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  outputTokenDetails: {
    textTokens: 0,
    reasoningTokens: 0,
  },
};

type UIStreamOptions = Parameters<ReturnType<typeof streamText>["toUIMessageStream"]>[0];

const createClosedStream = () =>
  new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

const buildStreamResult = (overrides: Partial<ReturnType<typeof streamText>> = {}) => {
  const toUIMessageStream = vi.fn<(options?: UIStreamOptions) => ReadableStream>(() =>
    createClosedStream(),
  );
  const consumeStream = vi.fn(() => Promise.resolve());
  const result = {
    usage: Promise.resolve(baseUsage),
    toUIMessageStream,
    consumeStream,
    ...overrides,
  } as ReturnType<typeof streamText>;

  return { result, toUIMessageStream, consumeStream };
};

beforeEach(() => {
  vi.clearAllMocks();
  resetAllMocks();
  randomUUIDMock.mockReset();
  randomUUIDMock
    .mockReturnValueOnce("00000000-0000-0000-0000-000000000001")
    .mockReturnValueOnce("00000000-0000-0000-0000-000000000002");
  getChatUserOrThrowMock.mockReturnValue(buildChatUser());
  mockModel = {} as LanguageModel;
  getAgentMock.mockResolvedValue({
    system: [{ role: "system", content: "sys" }],
    tools: {},
    defaultModel: mockModel,
  });
  admitAiGenerationMock.mockResolvedValue({
    allowed: true,
    admission: {
      reservedUsage: 1000,
      finalizeUsage: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    },
  });
  prepareChatRequestMessagesMock.mockResolvedValue({
    streamMessages: [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
    ],
    modelMessages: [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
    ],
  });
  convertToModelMessagesMock.mockResolvedValue([
    { role: "user", content: [{ type: "text", text: "hello" }] },
  ]);
  setCobuildDbResponse(chat, [
    {
      user: "0xabc0000000000000000000000000000000000000",
      type: "chat-default",
      data: {},
      title: null,
    },
  ]);
  isChatDebugEnabledMock.mockReturnValue(false);
});

describe("handleChatPostRequest", () => {
  it("returns 404 when the chat does not exist", async () => {
    setCobuildDbResponse(chat, []);

    const reply = createReply();
    const result = await handleChatPostRequest(buildRequest(baseBody), reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ error: "Chat not found" });
    expect(prepareChatRequestMessagesMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("returns 404 when the chat belongs to a different user", async () => {
    setCobuildDbResponse(chat, [
      {
        user: "0x0000000000000000000000000000000000000009",
        type: "chat-default",
        data: {},
        title: null,
      },
    ]);

    const reply = createReply();
    const result = await handleChatPostRequest(buildRequest(baseBody), reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ error: "Chat not found" });
    expect(prepareChatRequestMessagesMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("returns 400 when the stored chat type does not match the chat route", async () => {
    setCobuildDbResponse(chat, [
      {
        user: "0xabc0000000000000000000000000000000000000",
        type: "goal",
        data: {},
        title: null,
      },
    ]);

    const reply = createReply();
    const result = await handleChatPostRequest(buildRequest(baseBody), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ error: "Chat type mismatch" });
    expect(prepareChatRequestMessagesMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("normalizes stored chat data before agent construction", async () => {
    setCobuildDbResponse(chat, [
      {
        user: "0xabc0000000000000000000000000000000000000",
        type: "chat-default",
        data: JSON.stringify({
          goalAddress: "0xgoal",
          grantId: "grant-1",
          impactId: "impact-1",
          castId: "cast-1",
          opportunityId: "opp-1",
          startupId: "startup-1",
          draftId: "draft-1",
          ignored: 7,
        }),
        title: null,
      },
    ]);
    const { result } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    await handleChatPostRequest(buildRequest(baseBody), createReply());

    expect(getAgentMock).toHaveBeenCalledWith(
      "chat-default",
      expect.anything(),
      {
        goalAddress: "0xgoal",
        grantId: "grant-1",
        impactId: "impact-1",
        castId: "cast-1",
        opportunityId: "opp-1",
        startupId: "startup-1",
        draftId: "draft-1",
      },
    );
  });

  it("treats malformed stored chat data as empty agent context", async () => {
    setCobuildDbResponse(chat, [
      {
        user: "0xabc0000000000000000000000000000000000000",
        type: "chat-default",
        data: "{not-json",
        title: null,
      },
    ]);
    const { result } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    await handleChatPostRequest(buildRequest(baseBody), createReply());

    expect(getAgentMock).toHaveBeenCalledWith("chat-default", expect.anything(), {});
  });

  it("returns 429 when AI admission denies usage", async () => {
    admitAiGenerationMock.mockResolvedValueOnce({
      allowed: false,
      code: "rate-limited",
      retryAfterSeconds: 12,
    });

    const reply = createReply();
    reply.header.mockReturnThis();
    const result = await handleChatPostRequest(buildRequest(baseBody), reply);

    expect(reply.status).toHaveBeenCalledWith(429);
    expect(reply.header).toHaveBeenCalledWith("Retry-After", "12");
    expect(reply.send).toHaveBeenCalledWith({
      error: "Too many AI requests. Please try again in a few hours.",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("returns 409 when another generation is already in progress for the chat", async () => {
    admitAiGenerationMock.mockResolvedValueOnce({
      allowed: false,
      code: "chat-inflight-limit",
      retryAfterSeconds: 1,
    });

    const reply = createReply();
    const result = await handleChatPostRequest(buildRequest(baseBody), reply);

    expect(reply.status).toHaveBeenCalledWith(409);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Another response is already in progress for this chat.",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("builds stream messages from authoritative stored history and request context", async () => {
    const userContent: Array<TextPart | ImagePart | FilePart> = [
      { type: "text", text: "hello" },
      { type: "image", image: "https://cdn.example.com/a.png" },
      {
        type: "file",
        data: new URL("https://cdn.example.com/v.mp4"),
        mediaType: "video/mp4",
      },
    ];

    const modelMessages: ModelMessage[] = [
      {
        role: "user",
        content: userContent,
      },
    ];

    convertToModelMessagesMock.mockResolvedValueOnce(modelMessages);
    const { result } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    const reply = createReply();
    await handleChatPostRequest(
      buildRequest(
        {
          ...baseBody,
          userMessage: "ignored by model conversion mock",
          attachments: [
            {
              type: "file",
              url: "https://cdn.example.com/context.txt",
              mediaType: "text/plain",
            },
          ],
          context: "  trimmed context  ",
        },
        { "x-client-device": "mobile" },
      ),
      reply,
    );

    expect(prepareChatRequestMessagesMock).toHaveBeenCalledWith({
      chatId: "chat-1",
      clientMessageId: "client-1",
      userMessage: "ignored by model conversion mock",
      attachments: [
        {
          type: "file",
          url: "https://cdn.example.com/context.txt",
          mediaType: "text/plain",
        },
      ],
      existingTitle: null,
    });
    expect(getAgentMock).toHaveBeenCalledWith(
      "chat-default",
      expect.objectContaining({ address: "0xabc0000000000000000000000000000000000000" }),
      {},
    );

    const call = streamTextMock.mock.calls[0]?.[0];
    expect(call?.model).toBe(mockModel);
    expect(call?.abortSignal).toBeInstanceOf(AbortSignal);
    expect(call?.providerOptions?.openai?.textVerbosity).toBe("low");

    const messages = call?.messages as ModelMessage[];
    expect(
      messages.some(
        (message) =>
          message.role === "user" &&
          typeof message.content === "string" &&
          message.content.includes("Additional context from the user"),
      ),
    ).toBe(true);
    expect(
      messages.some(
        (message) =>
          message.role === "system" &&
          typeof message.content === "string" &&
          message.content.includes("attachments"),
      ),
    ).toBe(true);
    const userMessage = messages.find(
      (message) => message.role === "user" && Array.isArray(message.content),
    );
    const parts = userMessage?.content as Array<{ type: string; mediaType?: string }>;
    expect(parts.find((part) => part.type === "file" && part.mediaType?.startsWith("video/"))).toBe(
      undefined,
    );
  });

  it("includes file-search result expansion when the agent exposes file_search", async () => {
    getAgentMock.mockResolvedValueOnce({
      system: [{ role: "system", content: "sys" }],
      tools: {
        file_search: tool({
          description: "file search",
          inputSchema: z.object({}),
          execute: async () => ({ ok: true }),
        }),
      },
      defaultModel: mockModel,
    });
    const { result } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    await handleChatPostRequest(buildRequest(baseBody), createReply());

    expect(streamTextMock.mock.calls[0]?.[0]?.providerOptions?.openai?.include).toEqual([
      "file_search_call.results",
    ]);
  });

  it("stores pending and finished assistant messages with trusted ids", async () => {
    const { result, toUIMessageStream, consumeStream } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    const reply = createReply();
    const response = await handleChatPostRequest(buildRequest(baseBody), reply);

    expect(response).toBeInstanceOf(Response);
    expect(storeAssistantMessagesMock).toHaveBeenNthCalledWith(1, {
      chatId: "chat-1",
      messages: [
        {
          id: "00000000-0000-0000-0000-000000000002",
          role: "assistant",
          parts: [],
          metadata: { pending: true },
        },
      ],
      trustedMessageIds: ["00000000-0000-0000-0000-000000000002"],
    });

    const options = toUIMessageStream.mock.calls[0]?.[0];
    await options?.onFinish?.({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        },
        {
          id: "00000000-0000-0000-0000-000000000002",
          role: "assistant",
          parts: [{ type: "text", text: "done" }],
        },
      ],
      isContinuation: false,
      isAborted: false,
      responseMessage: {
        id: "00000000-0000-0000-0000-000000000002",
        role: "assistant",
        parts: [{ type: "text", text: "done" }],
      },
    });

    expect(storeAssistantMessagesMock).toHaveBeenNthCalledWith(2, {
      chatId: "chat-1",
      messages: [
        {
          id: "00000000-0000-0000-0000-000000000002",
          role: "assistant",
          parts: [{ type: "text", text: "done" }],
        },
      ],
      trustedMessageIds: ["00000000-0000-0000-0000-000000000002"],
    });
    expect(clearPendingAssistantIfUnclaimedMock).toHaveBeenCalledWith(
      "chat-1",
      "00000000-0000-0000-0000-000000000002",
      [
        {
          id: "00000000-0000-0000-0000-000000000002",
          role: "assistant",
          parts: [{ type: "text", text: "done" }],
        },
      ],
    );
    expect(consumeStream).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid user message payloads without overwriting chat history", async () => {
    prepareChatRequestMessagesMock.mockRejectedValueOnce(
      new InvalidChatRequestMessageError("bad user payload"),
    );

    const reply = createReply();
    const result = await handleChatPostRequest(buildRequest(baseBody), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ error: "bad user payload" });
    expect(admitAiGenerationMock).not.toHaveBeenCalled();
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("throws a persistence error when preparing the authoritative user turn fails unexpectedly", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    prepareChatRequestMessagesMock.mockRejectedValueOnce("write failed");

    await expect(handleChatPostRequest(buildRequest(baseBody), createReply())).rejects.toThrow(
      CHAT_PERSIST_ERROR,
    );

    expect(admitAiGenerationMock).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("returns 409 for duplicate processed or in-progress messages", async () => {
    prepareChatRequestMessagesMock
      .mockRejectedValueOnce(new ChatMessageInProgressError("Message already in progress."))
      .mockRejectedValueOnce(new ChatMessageAlreadyProcessedError("Message already processed."));

    const reply1 = createReply();
    await handleChatPostRequest(buildRequest(baseBody), reply1);
    expect(reply1.status).toHaveBeenCalledWith(409);
    expect(reply1.send).toHaveBeenCalledWith({ error: "Message already in progress." });

    const reply2 = createReply();
    await handleChatPostRequest(buildRequest(baseBody), reply2);
    expect(reply2.status).toHaveBeenCalledWith(409);
    expect(reply2.send).toHaveBeenCalledWith({ error: "Message already processed." });
  });

  it("marks the pending assistant as failed when streaming errors occur", async () => {
    const { result, toUIMessageStream } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    const reply = createReply();
    await handleChatPostRequest(buildRequest(baseBody), reply);

    const options = toUIMessageStream.mock.calls[0]?.[0];
    const responseMessage = options?.onError?.(new Error("boom"));
    await Promise.resolve();

    expect(responseMessage).toBe("Something went wrong generating a response. Please retry.");
    expect(markAssistantMessageFailedMock).toHaveBeenCalledWith(
      "chat-1",
      "00000000-0000-0000-0000-000000000002",
      "Something went wrong generating a response. Please retry.",
    );
  });

  it("releases admission only once when stream cleanup is triggered repeatedly", async () => {
    const admission = {
      reservedUsage: 1000,
      finalizeUsage: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };
    admitAiGenerationMock.mockResolvedValueOnce({ allowed: true, admission });
    const { result, toUIMessageStream } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    await handleChatPostRequest(buildRequest(baseBody), createReply());

    const options = toUIMessageStream.mock.calls[0]?.[0];
    options?.onError?.(new Error("boom"));
    options?.onError?.(new Error("boom again"));
    await Promise.resolve();

    expect(admission.release).toHaveBeenCalledTimes(1);
    expect(admission.finalizeUsage).not.toHaveBeenCalled();
  });

  it("cleans up and releases admission when stream setup throws before a response exists", async () => {
    const admission = {
      reservedUsage: 1000,
      finalizeUsage: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };
    admitAiGenerationMock.mockResolvedValueOnce({ allowed: true, admission });
    streamTextMock.mockImplementationOnce(() => {
      throw new Error("stream unavailable");
    });

    const reply = createReply();
    const request = buildRequest(baseBody);

    await expect(handleChatPostRequest(request, reply)).rejects.toThrow("stream unavailable");

    expect(request.raw.off).toHaveBeenCalledWith("aborted", expect.any(Function));
    expect(clearPendingAssistantIfUnclaimedMock).toHaveBeenCalledWith(
      "chat-1",
      "00000000-0000-0000-0000-000000000002",
      [],
    );
    expect(admission.finalizeUsage).not.toHaveBeenCalled();
    expect(admission.release).toHaveBeenCalledTimes(1);
  });

  it("releases admission and surfaces a persistence error when final assistant storage fails", async () => {
    const admission = {
      reservedUsage: 1000,
      finalizeUsage: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };
    admitAiGenerationMock.mockResolvedValueOnce({ allowed: true, admission });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result, toUIMessageStream } = buildStreamResult();
    streamTextMock.mockReturnValue(result);
    storeAssistantMessagesMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce("store failed");

    await handleChatPostRequest(buildRequest(baseBody), createReply());

    const options = toUIMessageStream.mock.calls[0]?.[0];
    await expect(
      options?.onFinish?.({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "hello" }],
          },
          {
            id: "00000000-0000-0000-0000-000000000002",
            role: "assistant",
            parts: [{ type: "text", text: "done" }],
          },
        ],
        isContinuation: false,
        isAborted: false,
        responseMessage: {
          id: "00000000-0000-0000-0000-000000000002",
          role: "assistant",
          parts: [{ type: "text", text: "done" }],
        },
      }),
    ).rejects.toThrow(CHAT_PERSIST_ERROR);

    expect(admission.finalizeUsage).not.toHaveBeenCalled();
    expect(admission.release).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it("reuses the pending assistant id once and allocates fresh trusted ids for follow-up assistant messages", async () => {
    randomUUIDMock.mockReturnValueOnce("00000000-0000-0000-0000-000000000003");
    const { result, toUIMessageStream } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    await handleChatPostRequest(buildRequest(baseBody), createReply());

    const options = toUIMessageStream.mock.calls[0]?.[0];
    expect(options?.generateMessageId?.()).toBe("00000000-0000-0000-0000-000000000002");
    expect(options?.generateMessageId?.()).toBe("00000000-0000-0000-0000-000000000003");

    await options?.onFinish?.({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        },
        {
          id: "00000000-0000-0000-0000-000000000002",
          role: "assistant",
          parts: [{ type: "text", text: "first" }],
        },
        {
          id: "00000000-0000-0000-0000-000000000003",
          role: "assistant",
          parts: [{ type: "text", text: "second" }],
        },
      ],
      isContinuation: false,
      isAborted: false,
      responseMessage: {
        id: "00000000-0000-0000-0000-000000000003",
        role: "assistant",
        parts: [{ type: "text", text: "second" }],
      },
    });

    expect(storeAssistantMessagesMock).toHaveBeenNthCalledWith(2, {
      chatId: "chat-1",
      messages: [
        {
          id: "00000000-0000-0000-0000-000000000002",
          role: "assistant",
          parts: [{ type: "text", text: "first" }],
        },
        {
          id: "00000000-0000-0000-0000-000000000003",
          role: "assistant",
          parts: [{ type: "text", text: "second" }],
        },
      ],
      trustedMessageIds: [
        "00000000-0000-0000-0000-000000000002",
        "00000000-0000-0000-0000-000000000003",
      ],
    });
  });

  it("does not reserve AI admission when agent construction fails", async () => {
    getAgentMock.mockRejectedValueOnce(new Error("agent unavailable"));

    const reply = createReply();
    await expect(handleChatPostRequest(buildRequest(baseBody), reply)).rejects.toThrow(
      "agent unavailable",
    );

    expect(admitAiGenerationMock).not.toHaveBeenCalled();
    expect(storeAssistantMessagesMock).not.toHaveBeenCalled();
  });

  it("logs successful storage in debug mode and tolerates missing usage totals", async () => {
    const admission = {
      reservedUsage: 1000,
      finalizeUsage: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };
    admitAiGenerationMock.mockResolvedValueOnce({ allowed: true, admission });
    isChatDebugEnabledMock.mockReturnValueOnce(true);
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { result, toUIMessageStream } = buildStreamResult({
      usage: Promise.reject(new Error("usage unavailable")),
    });
    streamTextMock.mockReturnValue(result);

    await handleChatPostRequest(buildRequest(baseBody), createReply());

    const options = toUIMessageStream.mock.calls[0]?.[0];
    await options?.onFinish?.({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        },
        {
          id: "00000000-0000-0000-0000-000000000002",
          role: "assistant",
          parts: [{ type: "text", text: "done" }],
        },
      ],
      isContinuation: false,
      isAborted: false,
      responseMessage: {
        id: "00000000-0000-0000-0000-000000000002",
        role: "assistant",
        parts: [{ type: "text", text: "done" }],
      },
    });

    expect(admission.finalizeUsage).not.toHaveBeenCalled();
    expect(admission.release).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).toHaveBeenCalledWith("Stored chat messages", {
      chatId: "chat-1",
      messageCount: 2,
    });
    consoleInfoSpy.mockRestore();
  });

  it("cleans up the pending assistant on request aborts", async () => {
    const admission = {
      reservedUsage: 1000,
      finalizeUsage: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };
    admitAiGenerationMock.mockResolvedValueOnce({ allowed: true, admission });
    const { result } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    const reply = createReply();
    const request = buildRequest(baseBody);
    await handleChatPostRequest(request, reply);

    expect(request.raw.once).toHaveBeenCalledTimes(1);
    expect(request.raw.once).toHaveBeenCalledWith("aborted", expect.any(Function));
    const handleDisconnect = request.raw.once.mock.calls[0]?.[1] as (() => void) | undefined;
    handleDisconnect?.();
    await Promise.resolve();

    expect(clearPendingAssistantIfUnclaimedMock).toHaveBeenCalledWith(
      "chat-1",
      "00000000-0000-0000-0000-000000000002",
      [],
    );
    expect(admission.finalizeUsage).not.toHaveBeenCalled();
    expect(admission.release).toHaveBeenCalledTimes(1);
  });

  it("throws the persistence error when initial assistant persistence fails", async () => {
    storeAssistantMessagesMock.mockRejectedValueOnce("db down");

    const reply = createReply();
    await expect(handleChatPostRequest(buildRequest(baseBody), reply)).rejects.toThrow(
      CHAT_PERSIST_ERROR,
    );
  });
});
