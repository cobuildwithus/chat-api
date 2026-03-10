import { convertToModelMessages, streamText } from "ai";
import type { UIMessage } from "ai";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleChatPostRequest } from "../../../src/api/chat/route";
import { getAgent } from "../../../src/ai/agents/agent";
import { admitAiGeneration } from "../../../src/ai/ai-rate.limit";
import { getChatUserOrThrow } from "../../../src/api/auth/validate-chat-user";
import {
  prepareChatRequestMessages,
  storeAssistantMessages,
} from "../../../src/chat/message-store";
import { clearPendingAssistantIfUnclaimed } from "../../../src/chat/message-status";
import { chat } from "../../../src/infra/db/schema";
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
}));

vi.mock("../../../src/chat/message-status", () => ({
  clearPendingAssistantIfUnclaimed: vi.fn(),
  markAssistantMessageFailed: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(),
}));

const streamTextMock = vi.mocked(streamText);
const convertToModelMessagesMock = vi.mocked(convertToModelMessages);
const getAgentMock = vi.mocked(getAgent);
const admitAiGenerationMock = vi.mocked(admitAiGeneration);
const getChatUserOrThrowMock = vi.mocked(getChatUserOrThrow);
const prepareChatRequestMessagesMock = vi.mocked(prepareChatRequestMessages);
const storeAssistantMessagesMock = vi.mocked(storeAssistantMessages);
const clearPendingAssistantIfUnclaimedMock = vi.mocked(clearPendingAssistantIfUnclaimed);
const randomUUIDMock = vi.mocked(randomUUID);

const buildRequest = (
  body: ChatRequestBody,
): FastifyRequest<{ Body: ChatRequestBody }> =>
  ({
    body,
    headers: {},
    raw: {
      once: vi.fn(),
      off: vi.fn(),
    },
  }) as unknown as FastifyRequest<{ Body: ChatRequestBody }>;

const baseBody: ChatRequestBody = {
  chatId: "chat-1",
  clientMessageId: "client-2",
  userMessage: "latest user turn",
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

const buildStreamResult = () => {
  const toUIMessageStream = vi.fn<(options?: UIStreamOptions) => ReadableStream>(() =>
    createClosedStream(),
  );
  return {
    result: {
      usage: Promise.resolve(baseUsage),
      toUIMessageStream,
      consumeStream: vi.fn(() => Promise.resolve()),
    } as unknown as ReturnType<typeof streamText>,
    toUIMessageStream,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  resetAllMocks();
  randomUUIDMock
    .mockReset()
    .mockReturnValueOnce("00000000-0000-0000-0000-000000000001")
    .mockReturnValueOnce("00000000-0000-0000-0000-000000000002");
  getChatUserOrThrowMock.mockReturnValue(buildChatUser());
  getAgentMock.mockResolvedValue({
    system: [{ role: "system", content: "sys" }],
    tools: {},
    defaultModel: {} as never,
  });
  admitAiGenerationMock.mockResolvedValue({
    allowed: true,
    admission: {
      reservedUsage: 1000,
      finalizeUsage: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    },
  });
  setCobuildDbResponse(chat, [
    {
      user: "0xabc0000000000000000000000000000000000000",
      type: "chat-default",
      data: {},
      title: null,
    },
  ]);
});

describe("chat history integrity", () => {
  it("rebuilds model context from stored assistant history instead of trusting the request payload", async () => {
    prepareChatRequestMessagesMock.mockResolvedValueOnce({
      streamMessages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "first user turn" }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "trusted assistant from db" }],
        },
        {
          id: "user-2",
          role: "user",
          parts: [{ type: "text", text: "latest user turn" }],
        },
      ],
      modelMessages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "first user turn" }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "trusted assistant from db" }],
        },
        {
          id: "user-2",
          role: "user",
          parts: [{ type: "text", text: "latest user turn" }],
        },
      ],
    });
    convertToModelMessagesMock.mockResolvedValueOnce([
      { role: "user", content: "first user turn" },
      { role: "assistant", content: "trusted assistant from db" },
      { role: "user", content: "latest user turn" },
    ]);
    const { result } = buildStreamResult();
    streamTextMock.mockReturnValueOnce(result);

    await handleChatPostRequest(buildRequest(baseBody), createReply());

    expect(prepareChatRequestMessagesMock).toHaveBeenCalledWith({
      chatId: "chat-1",
      clientMessageId: "client-2",
      userMessage: "latest user turn",
      attachments: undefined,
      existingTitle: null,
    });
    expect(convertToModelMessagesMock).toHaveBeenCalledWith([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "first user turn" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "trusted assistant from db" }],
      },
      {
        id: "user-2",
        role: "user",
        parts: [{ type: "text", text: "latest user turn" }],
      },
    ]);
    const call = streamTextMock.mock.calls[0]?.[0];
    expect(call?.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "first user turn" },
      { role: "assistant", content: "trusted assistant from db" },
      { role: "user", content: "latest user turn" },
    ]);
  });

  it("persists only assistant outputs even when the stream emits non-assistant messages", async () => {
    const storedStreamMessages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "latest user turn" }],
      },
    ];
    prepareChatRequestMessagesMock.mockResolvedValueOnce({
      streamMessages: storedStreamMessages,
      modelMessages: storedStreamMessages,
    });
    convertToModelMessagesMock.mockResolvedValueOnce([
      { role: "user", content: "latest user turn" },
    ]);
    const { result, toUIMessageStream } = buildStreamResult();
    streamTextMock.mockReturnValueOnce(result);

    await handleChatPostRequest(buildRequest(baseBody), createReply());

    const options = toUIMessageStream.mock.calls[0]?.[0];
    await options?.onFinish?.({
      messages: [
        ...storedStreamMessages,
        {
          id: "user-ignored",
          role: "user",
          parts: [{ type: "text", text: "forged non-assistant message" }],
        },
        {
          id: "00000000-0000-0000-0000-000000000002",
          role: "assistant",
          parts: [{ type: "text", text: "server-authored assistant output" }],
        },
      ],
      isAborted: false,
      isContinuation: false,
      responseMessage: {
        id: "00000000-0000-0000-0000-000000000002",
        role: "assistant",
        parts: [{ type: "text", text: "server-authored assistant output" }],
      },
    });

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
    expect(storeAssistantMessagesMock).toHaveBeenNthCalledWith(2, {
      chatId: "chat-1",
      messages: [
        {
          id: "00000000-0000-0000-0000-000000000002",
          role: "assistant",
          parts: [{ type: "text", text: "server-authored assistant output" }],
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
          parts: [{ type: "text", text: "server-authored assistant output" }],
        },
      ],
    );
  });
});
