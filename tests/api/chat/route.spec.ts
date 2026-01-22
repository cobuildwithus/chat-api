import { convertToModelMessages, streamText } from "ai";
import type {
  FilePart,
  ImagePart,
  LanguageModel,
  ModelMessage,
  TextPart,
  TextStreamPart,
  ToolSet,
} from "ai";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleChatPostRequest } from "../../../src/api/chat/route";
import { getAgent } from "../../../src/ai/agents/agent";
import { isAiUsageAvailable, recordAiUsage } from "../../../src/ai/ai-rate.limit";
import { getChatUserOrThrow } from "../../../src/api/auth/validate-chat-user";
import { storeChatMessages } from "../../../src/chat/message-store";
import {
  clearPendingAssistantIfUnclaimed,
  markAssistantMessageFailed,
} from "../../../src/chat/message-status";
import { chat } from "../../../src/infra/db/schema";
import type { ChatBody } from "../../../src/ai/types";
import { signChatGrant, verifyChatGrant } from "../../../src/chat/grant";
import { isChatDebugEnabled } from "../../../src/config/env";
import { CHAT_PERSIST_ERROR } from "../../../src/api/chat/chat-helpers";
import { createReply } from "../../utils/fastify";
import { buildChatUser } from "../../utils/fixtures/chat-user";
import { getDbCallCount, resetAllMocks, setCobuildDbResponse } from "../../utils/mocks/db";

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
  isAiUsageAvailable: vi.fn(),
  recordAiUsage: vi.fn(),
}));

vi.mock("../../../src/api/auth/validate-chat-user", () => ({
  getChatUserOrThrow: vi.fn(),
}));

vi.mock("../../../src/chat/message-store", () => ({
  storeChatMessages: vi.fn(),
}));

vi.mock("../../../src/chat/message-status", () => ({
  clearPendingAssistantIfUnclaimed: vi.fn(),
  markAssistantMessageFailed: vi.fn(),
}));

vi.mock("../../../src/chat/grant", () => ({
  signChatGrant: vi.fn(),
  verifyChatGrant: vi.fn(),
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
const isAiUsageAvailableMock = vi.mocked(isAiUsageAvailable);
const recordAiUsageMock = vi.mocked(recordAiUsage);
const getChatUserOrThrowMock = vi.mocked(getChatUserOrThrow);
const signChatGrantMock = vi.mocked(signChatGrant);
const verifyChatGrantMock = vi.mocked(verifyChatGrant);
const markAssistantMessageFailedMock = vi.mocked(markAssistantMessageFailed);
const clearPendingAssistantIfUnclaimedMock = vi.mocked(clearPendingAssistantIfUnclaimed);
const isChatDebugEnabledMock = vi.mocked(isChatDebugEnabled);
const randomUUIDMock = vi.mocked(randomUUID);
let mockModel: LanguageModel;
const storeChatMessagesMock = vi.mocked(storeChatMessages);

const buildRequest = (
  body: ChatBody,
  headers: Record<string, string> = {},
): FastifyRequest<{ Body: ChatBody }> =>
  ({ body, headers } as unknown as FastifyRequest<{ Body: ChatBody }>);

const baseBody: ChatBody = {
  id: "chat-1",
  type: "chat-default",
  messages: [],
};

const baseUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
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
  randomUUIDMock.mockReturnValue("00000000-0000-0000-0000-000000000000");
  getChatUserOrThrowMock.mockReturnValue(buildChatUser());
  mockModel = {} as LanguageModel;
  getAgentMock.mockResolvedValue({
    system: [{ role: "system", content: "sys" }],
    tools: {},
    defaultModel: mockModel,
  });
  setCobuildDbResponse(chat, [{ user: "0xabc0000000000000000000000000000000000000" }]);
  signChatGrantMock.mockResolvedValue("chat-grant");
  verifyChatGrantMock.mockResolvedValue(null);
});

describe("handleChatPostRequest", () => {
  it("returns 429 when rate limit denies usage", async () => {
    isAiUsageAvailableMock.mockResolvedValue(false);
    streamTextMock.mockReturnValue(buildStreamResult().result);

    const reply = createReply();
    const result = await handleChatPostRequest(buildRequest(baseBody), reply);

    expect(reply.status).toHaveBeenCalledWith(429);
    expect(reply.send).toHaveBeenCalledWith(
      "Too many AI requests. Please try again in a few hours.",
    );
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("builds stream messages with context, attachments, and filtered videos", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);

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

    convertToModelMessagesMock.mockResolvedValue(modelMessages);
    streamTextMock.mockReturnValue(buildStreamResult().result);

    const reply = createReply();
    await handleChatPostRequest(
      buildRequest({
        ...baseBody,
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] }],
        context: "  trimmed context  ",
      }),
      reply,
    );

    const streamCall = streamTextMock.mock.calls[0]?.[0];
    expect(streamCall?.model).toBe(mockModel);

    const messages = streamCall?.messages as ModelMessage[];
    const contextMessage = messages.find(
      (message) =>
        message.role === "system" &&
        typeof message.content === "string" &&
        message.content.includes("Additional context: trimmed context"),
    );
    expect(contextMessage).toBeTruthy();

    const attachmentsMessage = messages.find(
      (message) =>
        message.role === "system" &&
        typeof message.content === "string" &&
        message.content.includes("list of all the attachments"),
    );
    expect(attachmentsMessage).toBeTruthy();

    const userMessage = messages.find((message) => message.role === "user");
    expect(userMessage).toBeTruthy();
    const parts = userMessage?.content as Array<{ type: string; mediaType?: string }>;
    expect(parts.find((part) => part.type === "file" && part.mediaType?.startsWith("video/"))).toBe(
      undefined,
    );
  });

  it("sets text verbosity for mobile clients via header", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    convertToModelMessagesMock.mockResolvedValue([]);
    streamTextMock.mockReturnValue(buildStreamResult().result);

    const reply = createReply();
    await handleChatPostRequest(buildRequest(baseBody, { "x-client-device": "mobile" }), reply);

    const options = streamTextMock.mock.calls[0]?.[0];
    expect(options?.providerOptions?.openai?.textVerbosity).toBe("low");
  });

  it("infers mobile clients from user agent when header is missing", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    convertToModelMessagesMock.mockResolvedValue([]);
    streamTextMock.mockReturnValue(buildStreamResult().result);
    getChatUserOrThrowMock.mockReturnValue(
      buildChatUser({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      }),
    );

    const reply = createReply();
    await handleChatPostRequest(buildRequest(baseBody), reply);

    const options = streamTextMock.mock.calls[0]?.[0];
    expect(options?.providerOptions?.openai?.textVerbosity).toBe("low");
  });

  it("respects desktop device header even if user agent is mobile", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    convertToModelMessagesMock.mockResolvedValue([]);
    streamTextMock.mockReturnValue(buildStreamResult().result);
    getChatUserOrThrowMock.mockReturnValue(
      buildChatUser({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      }),
    );

    const reply = createReply();
    await handleChatPostRequest(buildRequest(baseBody, { "x-client-device": "desktop" }), reply);

    const options = streamTextMock.mock.calls[0]?.[0];
    expect(options?.providerOptions?.openai?.textVerbosity).toBeUndefined();
  });

  it("records AI usage when tokens are present", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    convertToModelMessagesMock.mockResolvedValue([]);
    const { result } = buildStreamResult({
      usage: Promise.resolve({
        ...baseUsage,
        totalTokens: 123,
        inputTokens: 50,
        outputTokens: 73,
        inputTokenDetails: {
          ...baseUsage.inputTokenDetails,
          noCacheTokens: 50,
        },
        outputTokenDetails: {
          ...baseUsage.outputTokenDetails,
          textTokens: 73,
        },
      }),
    });
    streamTextMock.mockReturnValue(result);

    const reply = createReply();
    await handleChatPostRequest(buildRequest(baseBody), reply);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      "0xabc0000000000000000000000000000000000000",
      123,
    );
  });

  it("persists conversation on finish", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);

    convertToModelMessagesMock.mockResolvedValue([]);

    const { result, toUIMessageStream } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    const reply = createReply();
    const response = await handleChatPostRequest(
      buildRequest({
        id: "chat-99",
        type: "chat-default",
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
      reply,
    );

    expect(response).toBeInstanceOf(Response);
    const options = toUIMessageStream.mock.calls[0]?.[0];
    if (!options?.onFinish) {
      throw new Error("Expected onFinish to be captured");
    }
    await options.onFinish({
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
        { id: "m2", role: "assistant", parts: [{ type: "text", text: "done" }] },
      ],
      isContinuation: false,
      isAborted: false,
      responseMessage: { id: "m2", role: "assistant", parts: [{ type: "text", text: "done" }] },
      finishReason: "stop",
    });

    expect(storeChatMessagesMock).toHaveBeenCalledTimes(2);
    const [initialCall, finishCall] = storeChatMessagesMock.mock.calls.map((call) => call[0]);
    expect(initialCall).toEqual(
      expect.objectContaining({
        chatId: "chat-99",
        generateTitle: false,
        type: "chat-default",
      }),
    );
    expect(initialCall?.messages).toHaveLength(2);
    expect(initialCall?.messages?.[1]).toEqual(
      expect.objectContaining({
        role: "assistant",
        metadata: { pending: true },
      }),
    );
    expect(finishCall).toEqual(
      expect.objectContaining({
        chatId: "chat-99",
        messages: expect.any(Array),
        type: "chat-default",
      }),
    );
  });

  it("attaches reasoning duration metadata from stream start to finish", async () => {
    vi.useFakeTimers();
    const startTime = new Date("2025-01-01T00:00:00Z");
    vi.setSystemTime(startTime);

    try {
      isAiUsageAvailableMock.mockResolvedValue(true);
      const modelMessages: ModelMessage[] = [
        { role: "user", content: [{ type: "text", text: "hello" }] },
      ];
      convertToModelMessagesMock.mockResolvedValue(modelMessages);

      const { result, toUIMessageStream } = buildStreamResult();
      streamTextMock.mockImplementation((options) => {
        return result;
      });

      const reply = createReply();
      const response = await handleChatPostRequest(
        buildRequest({
          id: "chat-100",
          type: "chat-default",
          messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] }],
        }),
        reply,
      );

      expect(response).toBeInstanceOf(Response);
      const options = toUIMessageStream.mock.calls[0]?.[0];
      if (!options?.messageMetadata) {
        throw new Error("Expected messageMetadata to be captured");
      }

      const startPart = { type: "start" } as unknown as TextStreamPart<ToolSet>;
      options.messageMetadata({ part: startPart });

      vi.setSystemTime(new Date(startTime.getTime() + 5000));
      const finishPart = { type: "finish" } as unknown as TextStreamPart<ToolSet>;
      const metadata = options.messageMetadata({ part: finishPart }) as
        | { reasoningDurationMs?: number }
        | undefined;
      expect(metadata?.reasoningDurationMs).toBe(5000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the UI stream response", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    convertToModelMessagesMock.mockResolvedValue([]);
    const { result, toUIMessageStream, consumeStream } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    const reply = createReply();
    const response = await handleChatPostRequest(buildRequest(baseBody), reply);
    expect(response).toBeInstanceOf(Response);
    expect(consumeStream).toHaveBeenCalledTimes(1);
    expect(toUIMessageStream).toHaveBeenCalled();

    const options = toUIMessageStream.mock.calls[0]?.[0];
    options?.generateMessageId?.();
    options?.generateMessageId?.();
  });

  it("uses the pending assistant id before generating a new id", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    convertToModelMessagesMock.mockResolvedValue([]);
    const { result, toUIMessageStream } = buildStreamResult();
    streamTextMock.mockReturnValue(result);
    randomUUIDMock
      .mockImplementationOnce(() => "11111111-1111-1111-1111-111111111111")
      .mockImplementationOnce(() => "22222222-2222-2222-2222-222222222222");

    const reply = createReply();
    await handleChatPostRequest(buildRequest(baseBody), reply);

    const options = toUIMessageStream.mock.calls[0]?.[0];
    const first = options?.generateMessageId?.();
    const second = options?.generateMessageId?.();
    expect(first).toBe("11111111-1111-1111-1111-111111111111");
    expect(second).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("returns 404 when chat does not exist", async () => {
    setCobuildDbResponse(chat, []);
    isAiUsageAvailableMock.mockResolvedValue(true);

    const reply = createReply();
    const result = await handleChatPostRequest(buildRequest(baseBody), reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ error: "Chat not found" });
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("returns 404 when chat belongs to another user", async () => {
    setCobuildDbResponse(chat, [{ user: "0xdef0000000000000000000000000000000000000" }]);
    isAiUsageAvailableMock.mockResolvedValue(true);

    const reply = createReply();
    const result = await handleChatPostRequest(buildRequest(baseBody), reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ error: "Chat not found" });
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("skips db lookup when a valid grant matches the chat", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    verifyChatGrantMock.mockResolvedValue({
      cid: baseBody.id,
      perm: "send",
      sub: "0xabc0000000000000000000000000000000000000",
    });
    convertToModelMessagesMock.mockResolvedValue([]);
    streamTextMock.mockReturnValue(buildStreamResult().result);

    const reply = createReply();
    await handleChatPostRequest(buildRequest(baseBody, { "x-chat-grant": "grant" }), reply);

    expect(getDbCallCount(chat)).toBe(0);
    expect(signChatGrantMock).not.toHaveBeenCalled();
  });

  it("issues a chat grant header when a grant is missing", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    convertToModelMessagesMock.mockResolvedValue([]);
    const { result, toUIMessageStream } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    const reply = createReply();
    const response = await handleChatPostRequest(buildRequest(baseBody), reply);

    expect(response.headers.get("x-chat-grant")).toBe("chat-grant");
    expect(toUIMessageStream).toHaveBeenCalled();
  });

  it("sets grant header when rate limited and grant issued", async () => {
    isAiUsageAvailableMock.mockResolvedValue(false);
    convertToModelMessagesMock.mockResolvedValue([]);
    streamTextMock.mockReturnValue(buildStreamResult().result);

    const reply = createReply();

    await handleChatPostRequest(buildRequest(baseBody), reply);

    expect(reply.header).toHaveBeenCalledWith("x-chat-grant", "chat-grant");
    expect(reply.status).toHaveBeenCalledWith(429);
  });

  it("throws when initial chat persistence fails", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    storeChatMessagesMock.mockRejectedValueOnce(new Error("db down"));

    const reply = createReply();
    await expect(handleChatPostRequest(buildRequest(baseBody), reply)).rejects.toThrow(
      CHAT_PERSIST_ERROR,
    );
  });

  it("includes file_search results when available", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    convertToModelMessagesMock.mockResolvedValue([]);
    streamTextMock.mockReturnValue(buildStreamResult().result);
    getAgentMock.mockResolvedValue({
      system: [],
      tools: { file_search: {} } as unknown as ToolSet,
      defaultModel: mockModel,
    });

    const reply = createReply();
    await handleChatPostRequest(buildRequest(baseBody), reply);

    const options = streamTextMock.mock.calls[0]?.[0];
    expect(options?.providerOptions?.openai?.include).toEqual(["file_search_call.results"]);
  });

  it("marks assistant message failed on stream error", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    convertToModelMessagesMock.mockResolvedValue([]);
    const { result, toUIMessageStream } = buildStreamResult();
    streamTextMock.mockReturnValue(result);

    const reply = createReply();
    await handleChatPostRequest(buildRequest(baseBody), reply);

    const options = toUIMessageStream.mock.calls[0]?.[0];
    if (!options?.onError) throw new Error("Expected onError to be captured");

    const message = options.onError(new Error("boom"));
    expect(message).toBe("boom");
    expect(markAssistantMessageFailedMock).toHaveBeenCalled();
  });

  it("logs debug info when chat debug is enabled", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    convertToModelMessagesMock.mockResolvedValue([]);
    const { result, toUIMessageStream } = buildStreamResult();
    streamTextMock.mockReturnValue(result);
    isChatDebugEnabledMock.mockReturnValue(true);

    const reply = createReply();
    const response = await handleChatPostRequest(buildRequest(baseBody), reply);

    const options = toUIMessageStream.mock.calls[0]?.[0];
    if (!options?.onFinish) throw new Error("Expected onFinish to be captured");

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    await options.onFinish({
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
      ],
      isContinuation: false,
      isAborted: false,
      responseMessage: { id: "m1", role: "assistant", parts: [] },
      finishReason: "stop",
    });
    expect(clearPendingAssistantIfUnclaimedMock).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      "Stored chat messages",
      expect.objectContaining({ chatId: baseBody.id }),
    );
    infoSpy.mockRestore();
  });

  it("throws when final chat persistence fails", async () => {
    isAiUsageAvailableMock.mockResolvedValue(true);
    convertToModelMessagesMock.mockResolvedValue([]);
    const { result, toUIMessageStream } = buildStreamResult();
    streamTextMock.mockReturnValue(result);
    storeChatMessagesMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("fail"));

    const reply = createReply();
    await handleChatPostRequest(buildRequest(baseBody), reply);

    const options = toUIMessageStream.mock.calls[0]?.[0];
    if (!options?.onFinish) throw new Error("Expected onFinish to be captured");

    await expect(
      options.onFinish({
        messages: [
          { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
        ],
        isContinuation: false,
        isAborted: false,
        responseMessage: { id: "m1", role: "assistant", parts: [] },
        finishReason: "stop",
      }),
    ).rejects.toThrow(CHAT_PERSIST_ERROR);
  });
});
