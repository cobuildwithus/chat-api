import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createReply } from "../../utils/fastify";
import { buildChatUser } from "../../utils/fixtures/chat-user";

const buildRequest = (query: Record<string, unknown> = {}) =>
  ({ query } as unknown as FastifyRequest);

function createSelectChain(rows: unknown[]) {
  const chain = {
    limit: vi.fn(() => Promise.resolve(rows)),
    orderBy: vi.fn(() => chain),
  };
  return chain;
}

describe("chat list goalAddress compatibility", () => {
  it("does not compose a goal-address database filter when goalAddress is provided", async () => {
    vi.resetModules();

    const now = new Date("2025-01-01T00:00:00Z");
    const rows = [
      {
        id: "chat-1",
        title: "Goal One",
        data: { goalAddress: "0xAbC0000000000000000000000000000000000000" },
        type: "chat-default",
        updatedAt: now,
        createdAt: now,
      },
    ];

    const drizzle = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
    const andSpy = vi.fn((...args: unknown[]) =>
      drizzle.and(...(args as Parameters<typeof drizzle.and>)),
    );
    const whereSpy = vi.fn(() => createSelectChain(rows));

    vi.doMock("drizzle-orm", () => ({
      ...drizzle,
      and: andSpy,
    }));
    vi.doMock("../../../src/infra/db/cobuildDb", () => ({
      cobuildPrimaryDb: vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: whereSpy,
          })),
        })),
      })),
    }));
    vi.doMock("../../../src/api/auth/validate-chat-user", () => ({
      getChatUserOrThrow: vi.fn(() => buildChatUser()),
    }));

    const { handleChatListRequest } = await import("../../../src/api/chat/list");
    const reply = createReply();

    await handleChatListRequest(
      buildRequest({ goalAddress: "0xabc0000000000000000000000000000000000000" }),
      reply,
    );

    expect(andSpy).not.toHaveBeenCalled();
    expect(whereSpy).toHaveBeenCalledTimes(1);
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
});
