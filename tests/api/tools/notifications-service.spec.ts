import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
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

const dialect = new PgDialect();

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
      if (key === "toolsPrincipal") {
        return {
          ownerAddress: "0x0000000000000000000000000000000000000001",
          agentKey: "forecast-bot",
        };
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
      eventAt: null,
      createdAt: "2026-03-08T12:00:04.654321Z",
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
        rows: [{ count: "2", watermark: "1741435200000001:101" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 101n,
            kind: "discussion",
            reason: "mention",
            eventAt: "2026-03-08T12:00:03.123456Z",
            eventAtCursor: "2026-03-08T12:00:03.123456Z",
            createdAt: "2026-03-08T12:00:06.123456Z",
            createdAtCursor: "2026-03-08T12:00:06.123456Z",
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
            eventAt: "2026-03-08T12:00:02.999999Z",
            eventAtCursor: "2026-03-08T12:00:02.999999Z",
            createdAt: "2026-03-08T12:00:05.000001Z",
            createdAtCursor: "2026-03-08T12:00:05.000001Z",
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
            eventAt: null,
            eventAtCursor: nextCursorSource.eventAt,
            createdAt: nextCursorSource.createdAt,
            createdAtCursor: nextCursorSource.createdAt,
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
            eventAt: "2026-03-08T12:00:00.000001Z",
            eventAtCursor: "2026-03-08T12:00:00.000001Z",
            createdAt: "2026-03-08T12:00:03.000001Z",
            createdAtCursor: "2026-03-08T12:00:03.000001Z",
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
        eventAt: "2026-03-08T12:00:10.111111Z",
        createdAt: "2026-03-08T12:00:11.222222Z",
        id: "500",
      }),
      kinds: ["discussion", "payment"],
    });

    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(result.subjectWalletAddress).toBe(subjectWalletAddress);
    expect(result.unread).toEqual({
      count: 2,
      watermark: "1741435200000001:101",
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
      eventAt: "2026-03-08T12:00:03.123456Z",
      createdAt: "2026-03-08T12:00:06.123456Z",
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
      payload: null,
    });
    expect(result.items[0].summary.title?.length).toBe(160);
    expect(result.items[0].summary.excerpt?.length).toBe(180);
    expect(result.items[1]).toMatchObject({
      id: "100",
      kind: "discussion",
      eventAt: "2026-03-08T12:00:02.999999Z",
      createdAt: "2026-03-08T12:00:05.000001Z",
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
      eventAt: null,
      createdAt: "2026-03-08T12:00:04.654321Z",
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

  it("shapes payment payloads to the public DTO contract", async () => {
    const subjectWalletAddress = "0x0000000000000000000000000000000000000001";

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
        rows: [{ count: "1", watermark: "1741435200000001:98" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 98n,
            kind: "payment",
            reason: "received",
            eventAt: "2026-03-08T12:00:00.000001Z",
            eventAtCursor: "2026-03-08T12:00:00.000001Z",
            createdAt: "2026-03-08T12:00:03.000001Z",
            createdAtCursor: "2026-03-08T12:00:03.000001Z",
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
            payload: { amount: 5n, ignored: "nope" },
          },
        ],
      });

    const result = await listWalletNotifications({
      limit: 1,
      unreadOnly: false,
      kinds: ["payment"],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "98",
        kind: "payment",
        payload: { amount: "5" },
      }),
    ]);
  });

  it("maps protocol notifications through the protocol presenter", async () => {
    const subjectWalletAddress = "0x0000000000000000000000000000000000000001";
    const goalTreasury = "0x00000000000000000000000000000000000000bb";
    const actorWalletAddress = "0x00000000000000000000000000000000000000cc";

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
        rows: [{ count: "1", watermark: "1741435200000001:42" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 42n,
            kind: "protocol",
            reason: "budget_accepted",
            eventAt: "2026-03-08T12:00:03.123456Z",
            eventAtCursor: "2026-03-08T12:00:03.123456Z",
            createdAt: "2026-03-08T12:00:06.123456Z",
            createdAtCursor: "2026-03-08T12:00:06.123456Z",
            isUnread: true,
            sourceType: "budget_request",
            sourceId: "proto-42",
            sourceHashHex: null,
            rootHashHex: null,
            targetHashHex: null,
            actorFid: null,
            actorWalletAddress,
            actorUsername: null,
            actorDisplayName: null,
            actorAvatarUrl: null,
            sourceText: null,
            rootText: null,
            payload: {
              labels: { goalName: "Alpha" },
              resource: { goalTreasury },
            },
          },
        ],
      });

    const result = await listWalletNotifications({
      limit: 1,
      unreadOnly: false,
      kinds: ["protocol"],
    });

    expect(result.unread).toEqual({
      count: 1,
      watermark: "1741435200000001:42",
    });
    expect(result.pageInfo).toEqual({
      limit: 1,
      nextCursor: null,
      hasMore: false,
    });
    expect(result.items).toMatchObject([
      {
        id: "42",
        kind: "protocol",
        reason: "budget_accepted",
        eventAt: "2026-03-08T12:00:03.123456Z",
        createdAt: "2026-03-08T12:00:06.123456Z",
        isUnread: true,
        actor: {
          fid: null,
          walletAddress: actorWalletAddress,
          name: "0x0000...00cc",
          username: null,
          avatarUrl: null,
        },
        summary: {
          title: "Budget accepted in Alpha.",
          excerpt: "The proposal cleared governance and is queued for activation.",
        },
        resource: {
          sourceType: "budget_request",
          sourceId: "proto-42",
          sourceHash: null,
          rootHash: null,
          targetHash: null,
          appPath: `/${goalTreasury}/events?focus=request`,
        },
        payload: {
          labels: { goalName: "Alpha" },
          resource: { goalTreasury },
        },
      },
    ]);
  });

  it("prefers the row actor wallet over payload actor fallback when both are present", async () => {
    const subjectWalletAddress = "0x0000000000000000000000000000000000000001";
    const rowActorWalletAddress = "0x00000000000000000000000000000000000000ee";
    const payloadActorWalletAddress = "0x00000000000000000000000000000000000000dd";

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
        rows: [{ count: "1", watermark: "1741435200000001:43" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 43n,
            kind: "protocol",
            reason: "budget_removal_requested",
            eventAt: "2026-03-08T12:00:03.123456Z",
            eventAtCursor: "2026-03-08T12:00:03.123456Z",
            createdAt: "2026-03-08T12:00:06.123456Z",
            createdAtCursor: "2026-03-08T12:00:06.123456Z",
            isUnread: true,
            sourceType: "budget_request",
            sourceId: "proto-43",
            sourceHashHex: null,
            rootHashHex: null,
            targetHashHex: null,
            actorFid: null,
            actorWalletAddress: rowActorWalletAddress,
            actorUsername: null,
            actorDisplayName: null,
            actorAvatarUrl: null,
            sourceText: null,
            rootText: null,
            payload: {
              role: "proposer",
              labels: { goalName: "Alpha" },
              resource: { goalTreasury: "0x00000000000000000000000000000000000000bb" },
              actor: { walletAddress: payloadActorWalletAddress },
            },
          },
        ],
      });

    const result = await listWalletNotifications({
      limit: 1,
      unreadOnly: false,
      kinds: ["protocol"],
    });

    expect(result.items[0]).toMatchObject({
      actor: {
        fid: null,
        walletAddress: rowActorWalletAddress,
        name: "0x0000...00ee",
      },
      summary: {
        title: "Removal requested for your budget in Alpha.",
        excerpt: "0x0000...00ee requested removal of your budget.",
      },
      payload: expect.objectContaining({
        role: "proposer",
        labels: expect.objectContaining({ goalName: "Alpha" }),
        resource: expect.objectContaining({
          goalTreasury: "0x00000000000000000000000000000000000000bb",
        }),
        actor: { walletAddress: payloadActorWalletAddress },
      }),
    });
  });

  it("preserves normalized protocol payload fields in the shared public DTO", async () => {
    mocks.requestContextGet.mockImplementation((key: string) => {
      if (key === "toolsPrincipal") {
        return {
          ownerAddress: "0x0000000000000000000000000000000000000001",
          agentKey: "forecast-bot",
        };
      }
      return undefined;
    });
    mocks.execute
      .mockResolvedValueOnce({
        rows: [{ count: "1", watermark: "1741435200000001:43" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 43n,
            kind: "protocol",
            reason: "budget_removal_requested",
            eventAt: "2026-03-08T12:00:03.123456Z",
            eventAtCursor: "2026-03-08T12:00:03.123456Z",
            createdAt: "2026-03-08T12:00:06.123456Z",
            createdAtCursor: "2026-03-08T12:00:06.123456Z",
            isUnread: true,
            sourceType: "budget_request",
            sourceId: "proto-43",
            sourceHashHex: null,
            rootHashHex: null,
            targetHashHex: null,
            actorFid: 9007199254740993n,
            actorWalletAddress: null,
            actorUsername: null,
            actorDisplayName: null,
            actorAvatarUrl: null,
            sourceText: null,
            rootText: null,
            payload: {
              role: "proposer",
              protocol: true,
              labels: {
                goalName: " Alpha ",
                reminderContextLabel: " Allocation mechanism removal request ",
              },
              resource: {
                goalTreasury: "0x00000000000000000000000000000000000000BB",
                budgetTreasury: "0x00000000000000000000000000000000000000CC",
                itemId: `0x${"A".repeat(64)}`,
                requestIndex: 3n,
                arbitrator: "0x00000000000000000000000000000000000000DD",
                disputeId: 9n,
              },
              actor: { walletAddress: "0x00000000000000000000000000000000000000DD" },
              schedule: {
                deliverAt: new Date("2026-03-08T12:00:00.000Z"),
                challengeWindowEndAt: 12n,
                reassertGraceDeadline: new Date("2026-03-09T12:00:00.000Z"),
              },
              amounts: {
                claimable: 7n,
                snapshotWeight: 9007199254740993n,
              },
              amount: 9007199254740993n,
              nested: {
                when: new Date("2026-03-08T12:00:00.000Z"),
                entries: ["ok", 7n, Number.POSITIVE_INFINITY],
              },
            },
          },
        ],
      });

    const result = await listWalletNotifications({
      limit: 1,
      unreadOnly: false,
      kinds: ["protocol"],
    });

    expect(result.items[0]).toMatchObject({
      actor: {
        fid: null,
        walletAddress: "0x00000000000000000000000000000000000000dd",
        name: "0x0000...00dd",
      },
      summary: {
        title: "Removal requested for your budget in Alpha.",
        excerpt: "0x0000...00dd requested removal of your budget.",
      },
      payload: expect.objectContaining({
        role: "proposer",
        protocol: true,
        labels: expect.objectContaining({
          goalName: "Alpha",
          reminderContextLabel: "Allocation mechanism removal request",
        }),
        resource: expect.objectContaining({
          goalTreasury: "0x00000000000000000000000000000000000000bb",
          budgetTreasury: "0x00000000000000000000000000000000000000cc",
          itemId: `0x${"a".repeat(64)}`,
          requestIndex: "3",
          arbitrator: "0x00000000000000000000000000000000000000dd",
          disputeId: "9",
        }),
        actor: { walletAddress: "0x00000000000000000000000000000000000000dd" },
        schedule: {
          deliverAt: "2026-03-08T12:00:00.000Z",
          votingStartAt: null,
          votingEndAt: null,
          revealEndAt: null,
          challengeWindowEndAt: "12",
          reassertGraceDeadline: "2026-03-09T12:00:00.000Z",
        },
        amounts: {
          allocatedStake: null,
          claimable: "7",
          claimedAmount: null,
          snapshotWeight: "9007199254740993",
          snapshotVotes: null,
          slashWeight: null,
        },
        amount: "9007199254740993",
        nested: {
          when: "2026-03-08T12:00:00.000Z",
          entries: ["ok", "7"],
        },
      }),
    });
    expect(result.items[0]?.payload).toHaveProperty("reward", null);
  });

  it("preserves unknown kinds instead of coercing them", async () => {
    mocks.requestContextGet.mockImplementation((key: string) => {
      if (key === "toolsPrincipal") {
        return {
          ownerAddress: "0x0000000000000000000000000000000000000001",
          agentKey: "forecast-bot",
        };
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
            eventAt: null,
            eventAtCursor: null,
            createdAt: "2026-03-08T10:00:01.000001Z",
            createdAtCursor: "2026-03-08T10:00:01.000001Z",
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
            eventAt: "2026-03-08T09:00:00.777777Z",
            eventAtCursor: "2026-03-08T09:00:00.777777Z",
            createdAt: "2026-03-08T09:00:01.888888Z",
            createdAtCursor: "2026-03-08T09:00:01.888888Z",
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
      watermark: "0:0",
    });
    expect(result.items[0]).toMatchObject({
      kind: "payment",
      eventAt: null,
      resource: {
        appPath: null,
      },
      payload: null,
    });
    expect(result.items[1]).toMatchObject({
      kind: "mystery",
      resource: {
        sourceType: "protocol",
        appPath: null,
      },
      payload: null,
    });
  });

  it("pins the SQL shape for kinds-filtered unread state and null-event cursors", async () => {
    mocks.requestContextGet.mockImplementation((key: string) => {
      if (key === "toolsPrincipal") {
        return {
          ownerAddress: "0x0000000000000000000000000000000000000001",
          agentKey: "forecast-bot",
        };
      }
      return undefined;
    });
    mocks.execute
      .mockResolvedValueOnce({
        rows: [{ count: "1", watermark: "1741435200000001:12" }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    await listWalletNotifications({
      limit: 5,
      unreadOnly: true,
      cursor: encodeWalletNotificationsCursor({
        eventAt: null,
        createdAt: "2026-03-08T12:00:04.654321Z",
        id: "99",
      }),
      kinds: ["payment"],
    });

    const unreadQuery = dialect.sqlToQuery(mocks.execute.mock.calls[0]?.[0]);
    const listQuery = dialect.sqlToQuery(mocks.execute.mock.calls[1]?.[0]);

    expect(unreadQuery.sql).toContain("notification.kind IN (");
    expect(unreadQuery.sql).toContain("notification.created_at > state.last_read_at");
    expect(unreadQuery.sql).toContain(
      "notification.id > COALESCE(state.last_read_notification_id, 0)",
    );
    expect(unreadQuery.sql).toContain("SELECT cursor");
    expect(unreadQuery.sql).not.toContain("notification.event_at IS NULL");
    expect(unreadQuery.params).toContain("payment");

    expect(listQuery.sql).toContain("notification.kind IN (");
    expect(listQuery.sql).toContain("notification.event_at IS NULL");
    expect(listQuery.sql).not.toContain("notification.event_at <");
    expect(listQuery.sql).toContain(
      "ORDER BY notification.event_at DESC NULLS LAST, notification.created_at DESC, notification.id DESC",
    );
    expect(listQuery.params).toContain("payment");
  });

  it("does not fall back to the request user when the tools principal is partial", async () => {
    mocks.requestContextGet.mockImplementation((key: string) => {
      if (key === "toolsPrincipal") {
        return {
          ownerAddress: "0x00000000000000000000000000000000000000aa",
        };
      }
      if (key === "user") {
        return { address: "0x00000000000000000000000000000000000000bb" };
      }
      return undefined;
    });

    await expect(
      listWalletNotifications({
        limit: 1,
        unreadOnly: false,
      }),
    ).rejects.toBeInstanceOf(WalletNotificationsSubjectRequiredError);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("maps scheduled juror protocol notifications through the shared presenter", async () => {
    const subjectWalletAddress = "0x0000000000000000000000000000000000000001";
    const goalTreasury = "0x00000000000000000000000000000000000000bb";
    const budgetTreasury = "0x00000000000000000000000000000000000000cc";
    const arbitrator = "0x00000000000000000000000000000000000000dd";

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
        rows: [{ count: "1", watermark: "1741435200000001:44" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 44n,
            kind: "protocol",
            reason: "juror_voting_open",
            eventAt: "2026-03-08T12:00:03.123456Z",
            eventAtCursor: "2026-03-08T12:00:03.123456Z",
            createdAt: "2026-03-08T12:00:06.123456Z",
            createdAtCursor: "2026-03-08T12:00:06.123456Z",
            isUnread: true,
            sourceType: "juror_dispute_phase",
            sourceId: `${arbitrator}:7:juror_voting_open`,
            sourceHashHex: null,
            rootHashHex: null,
            targetHashHex: null,
            actorFid: null,
            actorWalletAddress: null,
            actorUsername: null,
            actorDisplayName: null,
            actorAvatarUrl: null,
            sourceText: null,
            rootText: null,
            payload: {
              labels: { goalName: "Alpha" },
              resource: {
                goalTreasury,
                budgetTreasury,
                arbitrator,
                disputeId: "7",
              },
              schedule: {
                deliverAt: "2026-03-08T12:00:00.000Z",
                votingStartAt: "2026-03-08T12:00:00.000Z",
                votingEndAt: "2026-03-09T12:00:00.000Z",
                revealEndAt: "2026-03-10T12:00:00.000Z",
              },
            },
          },
        ],
      });

    const result = await listWalletNotifications({
      limit: 1,
      unreadOnly: false,
      kinds: ["protocol"],
    });

    expect(result.items[0]).toMatchObject({
      kind: "protocol",
      reason: "juror_voting_open",
      summary: {
        title: "Juror voting opened in Alpha.",
        excerpt: "Voting is now open on this dispute.",
      },
      resource: {
        sourceType: "juror_dispute_phase",
        sourceId: `${arbitrator}:7:juror_voting_open`,
        appPath: `/${goalTreasury}/events?budgetTreasury=${budgetTreasury}&disputeId=7&arbitrator=${arbitrator}&focus=dispute`,
      },
      payload: {
        resource: {
          goalTreasury,
          budgetTreasury,
          arbitrator,
          disputeId: "7",
        },
      },
    });
  });
});
