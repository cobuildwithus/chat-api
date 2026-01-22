import type { FastifyReply, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleChatListRequest } from "../../../src/api/chat/list";
import { chat } from "../../../src/infra/db/schema";
import { getChatUserOrThrow } from "../../../src/api/auth/validate-chat-user";
import { resetAllMocks, setCobuildDbResponse } from "../../utils/mocks/db";

vi.mock("../../../src/api/auth/validate-chat-user", () => ({
  getChatUserOrThrow: vi.fn(),
}));

const getChatUserOrThrowMock = vi.mocked(getChatUserOrThrow);

const buildRequest = (query: Record<string, unknown> = {}) =>
  ({ query } as unknown as FastifyRequest);

const buildReply = () =>
  ({
    send: vi.fn(),
  }) as unknown as FastifyReply;

beforeEach(() => {
  vi.clearAllMocks();
  resetAllMocks();
  getChatUserOrThrowMock.mockReturnValue({
    address: "0xabc0000000000000000000000000000000000000",
    city: null,
    country: null,
    countryRegion: null,
    userAgent: null,
  });
});

describe("handleChatListRequest", () => {
  it("filters chats by goal address (case-insensitive)", async () => {
    const now = new Date("2025-01-01T00:00:00Z");
    setCobuildDbResponse(chat, [
      {
        id: "chat-1",
        title: "Goal One",
        data: "{\"goalAddress\":\"0xAbC0000000000000000000000000000000000000\"}",
        type: "chat-default",
        updatedAt: now,
        createdAt: now,
      },
      {
        id: "chat-2",
        title: "Goal Two",
        data: "{\"goalAddress\":\"0xdef0000000000000000000000000000000000000\"}",
        type: "chat-default",
        updatedAt: now,
        createdAt: now,
      },
      {
        id: "chat-3",
        title: "Invalid data",
        data: "not-json",
        type: "chat-default",
        updatedAt: now,
        createdAt: now,
      },
    ]);

    const reply = buildReply();
    await handleChatListRequest(
      buildRequest({ goalAddress: "0xabc0000000000000000000000000000000000000" }),
      reply,
    );

    expect(reply.send).toHaveBeenCalledWith({
      chats: [
        {
          id: "chat-1",
          title: "Goal One",
          type: "chat-default",
          updatedAt: now.toISOString(),
          createdAt: now.toISOString(),
        },
      ],
    });
  });

  it("returns all chats when no goal filter is provided", async () => {
    const now = new Date("2025-02-01T00:00:00Z");
    setCobuildDbResponse(chat, [
      {
        id: "chat-1",
        title: null,
        data: "{}",
        type: "chat-default",
        updatedAt: now,
        createdAt: now,
      },
    ]);

    const reply = buildReply();
    await handleChatListRequest(buildRequest(), reply);

    expect(reply.send).toHaveBeenCalledWith({
      chats: [
        {
          id: "chat-1",
          title: null,
          type: "chat-default",
          updatedAt: now.toISOString(),
          createdAt: now.toISOString(),
        },
      ],
    });
  });
});
