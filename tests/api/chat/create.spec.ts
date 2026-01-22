import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { handleChatCreateRequest } from "../../../src/api/chat/create";
import { chat } from "../../../src/infra/db/schema";
import { getChatUserOrThrow } from "../../../src/api/auth/validate-chat-user";
import { signChatGrant } from "../../../src/chat/grant";
import { createReply } from "../../utils/fastify";
import { buildChatUser } from "../../utils/fixtures/chat-user";
import { queueCobuildDbResponse, resetAllMocks, setCobuildDbResponse } from "../../utils/mocks/db";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(),
}));

vi.mock("../../../src/api/auth/validate-chat-user", () => ({
  getChatUserOrThrow: vi.fn(),
}));

vi.mock("../../../src/chat/grant", () => ({
  signChatGrant: vi.fn(),
}));

const getChatUserOrThrowMock = vi.mocked(getChatUserOrThrow);
const signChatGrantMock = vi.mocked(signChatGrant);
const randomUUIDMock = vi.mocked(randomUUID);

const buildRequest = (body: { type: string; data?: Record<string, unknown> }) =>
  ({ body } as unknown as FastifyRequest);

beforeEach(() => {
  vi.clearAllMocks();
  resetAllMocks();
  getChatUserOrThrowMock.mockReturnValue(buildChatUser());
  signChatGrantMock.mockResolvedValue("chat-grant");
});

describe("handleChatCreateRequest", () => {
  it("returns a chat id and grant on success", async () => {
    randomUUIDMock.mockReturnValue(
      "chat-1" as `${string}-${string}-${string}-${string}-${string}`,
    );
    setCobuildDbResponse(chat, [{ id: "chat-1" }]);

    const reply = createReply();
    await handleChatCreateRequest(
      buildRequest({
        type: "chat-default",
        data: { goalAddress: "0xabc0000000000000000000000000000000000000" },
      }),
      reply,
    );

    expect(reply.send).toHaveBeenCalledWith({ chatId: "chat-1", chatGrant: "chat-grant" });
  });

  it("returns 500 after failing to create a chat", async () => {
    randomUUIDMock
      .mockReturnValueOnce("chat-a" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("chat-b" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("chat-c" as `${string}-${string}-${string}-${string}-${string}`);
    queueCobuildDbResponse(chat, []);
    queueCobuildDbResponse(chat, []);
    queueCobuildDbResponse(chat, []);

    const reply = createReply();
    await handleChatCreateRequest(buildRequest({ type: "chat-default" }), reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({ error: "Failed to create chat" });
    expect(signChatGrantMock).not.toHaveBeenCalled();
  });
});
