import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeWalletNotificationsCursor } from "../../../src/domains/notifications/cursor";
import {
  InvalidWalletNotificationsCursorError,
  WalletNotificationsSubjectRequiredError,
  listWalletNotifications,
} from "../../../src/domains/notifications/service";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  requestContextGet: vi.fn(),
}));

vi.mock("../../../src/infra/db/cobuildDb", () => ({
  cobuildPrimaryDb: () => ({
    execute: mocks.execute,
  }),
}));

vi.mock("@fastify/request-context", () => ({
  requestContext: {
    get: (...args: unknown[]) => mocks.requestContextGet(...args),
  },
}));

describe("wallet notifications service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requestContextGet.mockReturnValue(undefined);
  });

  it("requires an authenticated subject wallet", async () => {
    await expect(
      listWalletNotifications({
        limit: 20,
        unreadOnly: false,
      }),
    ).rejects.toBeInstanceOf(WalletNotificationsSubjectRequiredError);
  });

  it("rejects invalid cursors before querying the database", async () => {
    mocks.requestContextGet.mockImplementation((key: string) => {
      if (key === "user") {
        return { address: "0x0000000000000000000000000000000000000001" };
      }
      return undefined;
    });

    await expect(
      listWalletNotifications({
        limit: 20,
        unreadOnly: false,
        cursor: "invalid",
      }),
    ).rejects.toBeInstanceOf(InvalidWalletNotificationsCursorError);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("lists subject-wallet notifications with unread state, cursor pagination, and mapped summaries", async () => {
    const subjectWalletAddress = "0x0000000000000000000000000000000000000001";
    const nextCursorSource = {
      eventAt: "2026-03-08T12:00:01.000Z",
      createdAt: "2026-03-08T12:00:04.000Z",
      id: "99",
    };

    mocks.requestContextGet.mockImplementation((key: string) => {
      if (key === "toolsPrincipal") {
        return {
          ownerAddress: subjectWalletAddress,
          agentKey: "forecast-bot",
        };
      }
      return undefined;
    });
    mocks.execute
      .mockResolvedValueOnce({
        rows: [{ count: "2", watermark: "1741435200000001" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 101n,
            kind: "discussion",
            reason: "mention",
            eventAt: "2026-03-08T12:00:03.000Z",
            createdAt: "2026-03-08T12:00:06.000Z",
            isUnread: true,
            sourceType: "farcaster_cast",
            sourceId: "cast-101",
            sourceHashHex: "a".repeat(40),
            rootHashHex: "b".repeat(40),
            targetHashHex: "c".repeat(40),
            actorFid: 99n,
            actorWalletAddress: null,
            actorUsername: "alice",
            actorDisplayName: "Alice",
            actorAvatarUrl: "https://example.com/alice.png",
            sourceText: `Alice mentioned you in a reply ${"and added detail ".repeat(16)}`,
            rootText: `${"  \n"}${"Root post title ".repeat(20)}`,
            payload: { foo: "bar" },
          },
          {
            id: 100n,
            kind: "discussion",
            reason: "reply",
            eventAt: "2026-03-08T12:00:02.000Z",
            createdAt: "2026-03-08T12:00:05.000Z",
            isUnread: false,
            sourceType: "farcaster_cast",
            sourceId: "cast-100",
            sourceHashHex: "d".repeat(40),
            rootHashHex: "d".repeat(40),
            targetHashHex: null,
            actorFid: null,
            actorWalletAddress: null,
            actorUsername: null,
            actorDisplayName: null,
            actorAvatarUrl: null,
            sourceText: "   ",
            rootText: null,
            payload: ["ignored"],
          },
          {
            id: 99n,
            kind: "discussion",
            reason: "reply_to_reply",
            eventAt: nextCursorSource.eventAt,
            createdAt: nextCursorSource.createdAt,
            isUnread: true,
            sourceType: "farcaster_cast",
            sourceId: "cast-99",
            sourceHashHex: null,
            rootHashHex: "e".repeat(40),
            targetHashHex: null,
            actorFid: null,
            actorWalletAddress: "0x0000000000000000000000000000000000000002",
            actorUsername: null,
            actorDisplayName: null,
            actorAvatarUrl: null,
            sourceText: "Third reply",
            rootText: null,
            payload: null,
          },
          {
            id: 98n,
            kind: "payment",
            reason: "received",
            eventAt: "2026-03-08T12:00:00.000Z",
            createdAt: "2026-03-08T12:00:03.000Z",
            isUnread: true,
            sourceType: "payment",
            sourceId: "payment-98",
            sourceHashHex: null,
            rootHashHex: null,
            targetHashHex: null,
            actorFid: null,
            actorWalletAddress: "0x0000000000000000000000000000000000000003",
            actorUsername: null,
            actorDisplayName: null,
            actorAvatarUrl: null,
            sourceText: null,
            rootText: null,
            payload: { amount: "5" },
          },
        ],
      });

    const result = await listWalletNotifications({
      limit: 3,
      unreadOnly: true,
      cursor: encodeWalletNotificationsCursor({
        eventAt: "2026-03-08T12:00:10.000Z",
        createdAt: "2026-03-08T12:00:11.000Z",
        id: "500",
      }),
      kinds: ["discussion", "payment"],
    });

    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(result.subjectWalletAddress).toBe(subjectWalletAddress);
    expect(result.unread).toEqual({
      count: 2,
      watermark: "1741435200000001",
    });
    expect(result.pageInfo).toEqual({
      limit: 3,
      nextCursor: encodeWalletNotificationsCursor(nextCursorSource),
      hasMore: true,
    });
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({
      id: "101",
      kind: "discussion",
      reason: "mention",
      isUnread: true,
      actor: {
        fid: 99,
        walletAddress: null,
        name: "Alice",
        username: "alice",
        avatarUrl: "https://example.com/alice.png",
      },
      resource: {
        sourceType: "farcaster_cast",
        sourceId: "cast-101",
        sourceHash: `0x${"a".repeat(40)}`,
        rootHash: `0x${"b".repeat(40)}`,
        targetHash: `0x${"c".repeat(40)}`,
        appPath: `/cast/0x${"b".repeat(40)}?post=0x${"a".repeat(40)}`,
      },
      payload: { foo: "bar" },
    });
    expect(result.items[0].summary.title?.length).toBe(160);
    expect(result.items[0].summary.excerpt?.length).toBe(180);
    expect(result.items[1]).toMatchObject({
      id: "100",
      kind: "discussion",
      actor: null,
      summary: {
        title: null,
        excerpt: null,
      },
      resource: {
        appPath: `/cast/0x${"d".repeat(40)}`,
      },
      payload: null,
    });
    expect(result.items[2]).toMatchObject({
      id: "99",
      kind: "discussion",
      actor: {
        fid: null,
        walletAddress: "0x0000000000000000000000000000000000000002",
        name: null,
        username: null,
        avatarUrl: null,
      },
      resource: {
        sourceHash: null,
        rootHash: `0x${"e".repeat(40)}`,
        targetHash: null,
        appPath: null,
      },
      payload: null,
    });
  });

  it("supports user-context fallback and default unread metadata", async () => {
    mocks.requestContextGet.mockImplementation((key: string) => {
      if (key === "user") {
        return { address: "0x0000000000000000000000000000000000000001" };
      }
      return undefined;
    });
    mocks.execute
      .mockResolvedValueOnce({
        rows: [{ count: null, watermark: null }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "12",
            kind: "payment",
            reason: "received",
            eventAt: "2026-03-08T10:00:00.000Z",
            createdAt: "2026-03-08T10:00:01.000Z",
            isUnread: false,
            sourceType: "payment",
            sourceId: "pay-12",
            sourceHashHex: null,
            rootHashHex: null,
            targetHashHex: null,
            actorFid: null,
            actorWalletAddress: "0x0000000000000000000000000000000000000004",
            actorUsername: null,
            actorDisplayName: null,
            actorAvatarUrl: null,
            sourceText: null,
            rootText: null,
            payload: [],
          },
          {
            id: "11",
            kind: "mystery",
            reason: "other",
            eventAt: "2026-03-08T09:00:00.000Z",
            createdAt: "2026-03-08T09:00:01.000Z",
            isUnread: false,
            sourceType: "protocol",
            sourceId: "proto-11",
            sourceHashHex: "f".repeat(40),
            rootHashHex: "f".repeat(40),
            targetHashHex: null,
            actorFid: null,
            actorWalletAddress: null,
            actorUsername: "mystery",
            actorDisplayName: null,
            actorAvatarUrl: null,
            sourceText: "Protocol event",
            rootText: null,
            payload: { protocol: true },
          },
        ],
      });

    const result = await listWalletNotifications({
      limit: 2,
      unreadOnly: false,
    });

    expect(result.pageInfo).toEqual({
      limit: 2,
      nextCursor: null,
      hasMore: false,
    });
    expect(result.unread).toEqual({
      count: 0,
      watermark: "0",
    });
    expect(result.items[0]).toMatchObject({
      kind: "payment",
      resource: {
        appPath: null,
      },
      payload: null,
    });
    expect(result.items[1]).toMatchObject({
      kind: "discussion",
      resource: {
        sourceType: "protocol",
        appPath: null,
      },
      payload: { protocol: true },
    });
  });

  it("prefers the tools principal owner address over request user fallback", async () => {
    mocks.requestContextGet.mockImplementation((key: string) => {
      if (key === "toolsPrincipal") {
        return {
          ownerAddress: "0x00000000000000000000000000000000000000aa",
          agentKey: "forecast-bot",
        };
      }
      if (key === "user") {
        return { address: "0x00000000000000000000000000000000000000bb" };
      }
      return undefined;
    });
    mocks.execute
      .mockResolvedValueOnce({
        rows: [{ count: 0, watermark: "0" }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const result = await listWalletNotifications({
      limit: 1,
      unreadOnly: false,
    });

    expect(result.subjectWalletAddress).toBe("0x00000000000000000000000000000000000000aa");
  });
});
