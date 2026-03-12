import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReply } from "../../utils/fastify";

type SelectChain = {
  limit: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
};

function createSelectChain(rows: unknown[], options?: { orderByTerminal?: boolean }): SelectChain {
  const chain: SelectChain = {
    limit: vi.fn(() => Promise.resolve(rows)),
    orderBy: vi.fn(() =>
      options?.orderByTerminal ? Promise.resolve(rows) : chain,
    ),
  };
  return chain;
}

async function loadChatReadHandlers(options: {
  chatRows: unknown[];
  messageRows?: unknown[];
}) {
  vi.resetModules();

  const primarySelect = vi.fn();
  const replicaSelect = vi.fn();
  let chatSelectCount = 0;

  primarySelect.mockImplementation(() => ({
    from: () => ({
      where: () => {
        chatSelectCount += 1;
        return chatSelectCount === 1
          ? createSelectChain(options.chatRows)
          : createSelectChain(options.messageRows ?? [], { orderByTerminal: true });
      },
    }),
  }));

  replicaSelect.mockImplementation(() => ({
    from: () => ({
      where: () => createSelectChain([]),
    }),
  }));

  const primaryDb = {
    select: primarySelect,
  };
  const replicaDb = {
    select: replicaSelect,
  };

  vi.doMock("../../../src/infra/db/cobuildDb", () => ({
    cobuildDb: replicaDb,
    cobuildPrimaryDb: vi.fn(() => primaryDb),
  }));

  vi.doMock("../../../src/api/auth/validate-chat-user", () => ({
    getChatUserOrThrow: vi.fn(() => ({
      address: "0xabc0000000000000000000000000000000000000",
      city: null,
      country: null,
      countryRegion: null,
      userAgent: null,
    })),
  }));

  const getModule = await import("../../../src/api/chat/get");
  const listModule = await import("../../../src/api/chat/list");

  return {
    handleChatGetRequest: getModule.handleChatGetRequest,
    handleChatListRequest: listModule.handleChatListRequest,
    primarySelect,
    replicaSelect,
  };
}

describe("chat read consistency", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses the primary database path for chat GET reads", async () => {
    const { handleChatGetRequest, primarySelect, replicaSelect } = await loadChatReadHandlers({
      chatRows: [
        {
          user: "0xabc0000000000000000000000000000000000000",
          type: "chat-default",
          data: {},
          title: null,
        },
      ],
      messageRows: [
        {
          id: "message-1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
          metadata: null,
        },
      ],
    });

    const reply = createReply();
    await handleChatGetRequest(
      {
        params: { chatId: "chat-1" },
      } as unknown as FastifyRequest,
      reply,
    );

    expect(primarySelect).toHaveBeenCalledTimes(2);
    expect(replicaSelect).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith({
      chatId: "chat-1",
      type: "chat-default",
      data: {},
      messages: [
        {
          id: "message-1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        },
      ],
    });
  });

  it("uses the primary database path for chat LIST reads", async () => {
    const now = new Date("2026-03-10T12:00:00.000Z");
    const { handleChatListRequest, primarySelect, replicaSelect } = await loadChatReadHandlers({
      chatRows: [
        {
          id: "chat-1",
          title: "Latest",
          data: { goalAddress: "0xabc0000000000000000000000000000000000000" },
          type: "chat-default",
          updatedAt: now,
          createdAt: now,
        },
      ],
    });

    const reply = createReply();
    await handleChatListRequest(
      {
        query: {},
      } as unknown as FastifyRequest,
      reply,
    );

    expect(primarySelect).toHaveBeenCalledTimes(1);
    expect(replicaSelect).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith({
      chats: [
        {
          id: "chat-1",
          title: "Latest",
          type: "chat-default",
          updatedAt: now.toISOString(),
          createdAt: now.toISOString(),
        },
      ],
    });
  });
});
