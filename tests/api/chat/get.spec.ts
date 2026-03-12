import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleChatGetRequest } from "../../../src/api/chat/get";
import { chat, chatMessage } from "../../../src/infra/db/schema";
import { getChatUserOrThrow } from "../../../src/api/auth/validate-chat-user";
import { createReply } from "../../utils/fastify";
import { buildChatUser } from "../../utils/fixtures/chat-user";
import { resetAllMocks, setCobuildDbResponse } from "../../utils/mocks/db";

vi.mock("../../../src/api/auth/validate-chat-user", () => ({
  getChatUserOrThrow: vi.fn(),
}));

const getChatUserOrThrowMock = vi.mocked(getChatUserOrThrow);

const buildRequest = (chatId: string) =>
  ({ params: { chatId } } as unknown as FastifyRequest);

beforeEach(() => {
  vi.clearAllMocks();
  resetAllMocks();
  getChatUserOrThrowMock.mockReturnValue(
    buildChatUser() as ReturnType<typeof getChatUserOrThrow>,
  );
});

describe("handleChatGetRequest", () => {
  it("returns 404 when chat is missing", async () => {
    setCobuildDbResponse(chat, []);

    const reply = createReply();
    await handleChatGetRequest(buildRequest("chat-1"), reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ error: "Chat not found" });
  });

  it("returns 404 when the owner-scoped lookup finds no matching chat", async () => {
    setCobuildDbResponse(chat, [
      {
        user: "0x0000000000000000000000000000000000000009",
        type: "chat-default",
        data: {},
        title: null,
      },
    ]);

    const reply = createReply();
    await handleChatGetRequest(buildRequest("chat-2"), reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ error: "Chat not found" });
  });

  it("returns chat messages", async () => {
    setCobuildDbResponse(chat, [
      {
        user: "0xabc0000000000000000000000000000000000000",
        type: "chat-default",
        data: JSON.stringify({
          goalAddress: "0xabc0000000000000000000000000000000000000",
          ignored: 7,
        }),
        title: null,
      },
    ]);
    setCobuildDbResponse(chatMessage, [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
        metadata: { reasoningDurationMs: 1200 },
        position: 0,
      },
    ]);

    const reply = createReply();
    await handleChatGetRequest(buildRequest("chat-3"), reply);

    expect(reply.send).toHaveBeenCalledWith({
      chatId: "chat-3",
      type: "chat-default",
      data: { goalAddress: "0xabc0000000000000000000000000000000000000" },
      messages: [
        {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "hi" }],
          metadata: { reasoningDurationMs: 1200 },
        },
      ],
    });
  });

  it("sanitizes message parts and metadata", async () => {
    setCobuildDbResponse(chat, [
      {
        user: "0xabc0000000000000000000000000000000000000",
        type: "chat-default",
        data: "{}",
        title: null,
      },
    ]);
    setCobuildDbResponse(chatMessage, [
      {
        id: "m2",
        role: "assistant",
        parts: "not-array",
        metadata: "bad",
        position: 0,
      },
    ]);

    const reply = createReply();
    await handleChatGetRequest(buildRequest("chat-4"), reply);

    expect(reply.send).toHaveBeenCalledWith({
      chatId: "chat-4",
      type: "chat-default",
      data: {},
      messages: [
        {
          id: "m2",
          role: "assistant",
          parts: [],
        },
      ],
    });
  });
});
