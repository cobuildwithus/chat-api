import { streamText } from "ai";
import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleChatPostRequest } from "../../../src/api/chat/route";
import { getAgent } from "../../../src/ai/agents/agent";
import { admitAiGeneration } from "../../../src/ai/ai-rate.limit";
import { getChatUserOrThrow } from "../../../src/api/auth/validate-chat-user";
import {
  ChatMessageAlreadyProcessedError,
  prepareChatRequestMessages,
} from "../../../src/chat/message-store";
import { cobuildDb } from "../../../src/infra/db/cobuildDb";
import { chat, chatMessage } from "../../../src/infra/db/schema";
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

vi.mock("../../../src/chat/message-store", async () => {
  const actual = await vi.importActual<typeof import("../../../src/chat/message-store")>(
    "../../../src/chat/message-store",
  );
  return {
    ...actual,
    prepareChatRequestMessages: vi.fn(),
  };
});

const streamTextMock = vi.mocked(streamText);
const getAgentMock = vi.mocked(getAgent);
const admitAiGenerationMock = vi.mocked(admitAiGeneration);
const getChatUserOrThrowMock = vi.mocked(getChatUserOrThrow);
const prepareChatRequestMessagesMock = vi.mocked(prepareChatRequestMessages);

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

describe("chat idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllMocks();
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

  it("returns 409 without starting a second model run when the logical turn already completed", async () => {
    prepareChatRequestMessagesMock.mockRejectedValueOnce(
      new ChatMessageAlreadyProcessedError("Message already processed."),
    );

    const reply = createReply();
    const result = await handleChatPostRequest(
      buildRequest({
        chatId: "chat-1",
        clientMessageId: "client-1",
        userMessage: "hello",
      }),
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(409);
    expect(reply.send).toHaveBeenCalledWith({ error: "Message already processed." });
    expect(admitAiGenerationMock).not.toHaveBeenCalled();
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("treats a replayed stale turn as already processed without mutating the persisted assistant result", async () => {
    const {
      ChatMessageAlreadyProcessedError: ActualAlreadyProcessedError,
      prepareChatRequestMessages: loadActualPrepare,
    } = await vi.importActual<typeof import("../../../src/chat/message-store")>(
      "../../../src/chat/message-store"
    );
    const insertSpy = vi.spyOn(cobuildDb, "insert");
    const updateSpy = vi.spyOn(cobuildDb, "update");
    const deleteSpy = vi.spyOn(cobuildDb, "delete");

    setCobuildDbResponse(chatMessage, [
      {
        id: "user-1",
        clientId: "client-1",
        role: "user",
        parts: [{ type: "text", text: "original turn" }],
        metadata: null,
        position: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "assistant-1",
        clientId: null,
        role: "assistant",
        parts: [{ type: "text", text: "stored assistant result" }],
        metadata: null,
        position: 1,
        createdAt: new Date("2024-01-01T00:00:01Z"),
      },
      {
        id: "user-2",
        clientId: "client-2",
        role: "user",
        parts: [{ type: "text", text: "newer turn already stored" }],
        metadata: null,
        position: 2,
        createdAt: new Date("2024-01-01T00:00:02Z"),
      },
    ]);

    await expect(
      loadActualPrepare({
        chatId: "chat-1",
        clientMessageId: "client-1",
        userMessage: "original turn",
        existingTitle: "Existing title",
      }),
    ).rejects.toThrow(ActualAlreadyProcessedError);

    expect(insertSpy).not.toHaveBeenCalledWith(chatMessage);
    expect(updateSpy).not.toHaveBeenCalledWith(chat);
    expect(deleteSpy).not.toHaveBeenCalledWith(chatMessage);
  });

});
