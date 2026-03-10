import { convertToModelMessages, streamText } from "ai";
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

type MockFn = ReturnType<typeof vi.fn>;
type MockFastifyRequest = FastifyRequest<{ Body: ChatRequestBody }> & {
  raw: {
    once: MockFn;
    off: MockFn;
  };
};

const baseBody: ChatRequestBody = {
  chatId: "chat-1",
  clientMessageId: "client-1",
  userMessage: "hello",
};

const buildRequest = (): MockFastifyRequest =>
  ({
    body: baseBody,
    headers: {},
    raw: {
      once: vi.fn(),
      off: vi.fn(),
    },
  }) as unknown as MockFastifyRequest;

const buildStreamResult = () => ({
  usage: Promise.resolve({
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
  }),
  toUIMessageStream: vi.fn(() => new ReadableStream()),
  consumeStream: vi.fn(() => Promise.resolve()),
}) as unknown as ReturnType<typeof streamText>;

describe("chat disconnect behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllMocks();
    randomUUIDMock
      .mockReset()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
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
    storeAssistantMessagesMock.mockResolvedValue(undefined);
    setCobuildDbResponse(chat, [
      {
        user: "0xabc0000000000000000000000000000000000000",
        type: "chat-default",
        data: {},
        title: null,
      },
    ]);
  });

  it("aborts the upstream model signal before the first token when the request disconnects", async () => {
    const admission = {
      reservedUsage: 1000,
      finalizeUsage: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };
    admitAiGenerationMock.mockResolvedValueOnce({ allowed: true, admission });
    streamTextMock.mockReturnValueOnce(buildStreamResult());

    const request = buildRequest();
    await handleChatPostRequest(request, createReply());

    const abortSignal = streamTextMock.mock.calls[0]?.[0]?.abortSignal as AbortSignal | undefined;
    expect(abortSignal?.aborted).toBe(false);
    expect(request.raw.once).toHaveBeenCalledWith("aborted", expect.any(Function));

    const handleDisconnect = request.raw.once.mock.calls[0]?.[1] as (() => void) | undefined;
    handleDisconnect?.();
    await Promise.resolve();

    expect(abortSignal?.aborted).toBe(true);
    expect(String(abortSignal?.reason)).toContain("Chat client disconnected");
    expect(clearPendingAssistantIfUnclaimedMock).toHaveBeenCalledWith(
      "chat-1",
      "22222222-2222-4222-8222-222222222222",
      [],
    );
    expect(admission.finalizeUsage).toHaveBeenCalledTimes(1);
    expect(admission.finalizeUsage).toHaveBeenCalledWith(1000);
    expect(admission.release).toHaveBeenCalledTimes(1);
  });
});
