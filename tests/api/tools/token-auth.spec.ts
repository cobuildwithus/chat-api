import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateToolsBearerToken } from "../../../src/api/tools/token-auth";

const mocks = vi.hoisted(() => ({
  getRedisClient: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../../src/infra/redis", () => ({
  getRedisClient: mocks.getRedisClient,
}));

vi.mock("../../../src/infra/db/cobuildDb", () => ({
  cobuildDb: {
    select: mocks.select,
    update: mocks.update,
    $primary: {
      select: mocks.select,
      update: mocks.update,
    },
  },
}));

function flushTasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mockDbTokenLookup(rows: Array<{ id: bigint; ownerAddress: string; agentKey: string; canWrite: boolean }>) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mocks.select.mockReturnValue({ from });
  return { from, where, limit };
}

describe("authenticateToolsBearerToken", () => {
  const token = "bbt_test_token";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await flushTasks();
  });

  it("returns cached principal when redis has a valid cached entry", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          tokenId: "11",
          ownerAddress: "0x0000000000000000000000000000000000000001",
          agentKey: "default",
          canWrite: false,
        }),
      ),
      set: vi.fn().mockResolvedValue("OK"),
    };
    mocks.getRedisClient.mockResolvedValue(redis);
    mockDbTokenLookup([]);
    mocks.update.mockReturnValue({
      set: () => ({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const principal = await authenticateToolsBearerToken(token);
    await flushTasks();

    expect(principal).toEqual({
      tokenId: "11",
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
      canWrite: false,
    });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledTimes(1);
  });

  it("returns null when cached principal contains an invalid owner address", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ tokenId: "bad", ownerAddress: "bad", agentKey: "default", canWrite: false })),
      set: vi.fn().mockResolvedValue("OK"),
    };
    mocks.getRedisClient.mockResolvedValue(redis);

    const principal = await authenticateToolsBearerToken(token);

    expect(principal).toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("falls back to DB, caches principal, and returns normalized owner address", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
    };
    mocks.getRedisClient.mockResolvedValue(redis);
    const dbChain = mockDbTokenLookup([
      {
        id: 21n,
        ownerAddress: "0x0000000000000000000000000000000000000002",
        agentKey: "ops",
        canWrite: true,
      },
    ]);
    mocks.update.mockReturnValue({
      set: () => ({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const principal = await authenticateToolsBearerToken(token);
    await flushTasks();

    expect(principal).toEqual({
      tokenId: "21",
      ownerAddress: "0x0000000000000000000000000000000000000002",
      agentKey: "ops",
      canWrite: true,
    });
    expect(dbChain.limit).toHaveBeenCalledWith(1);
    expect(redis.set).toHaveBeenCalled();
  });

  it("returns null when DB token lookup misses", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
    };
    mocks.getRedisClient.mockResolvedValue(redis);
    mockDbTokenLookup([]);

    const principal = await authenticateToolsBearerToken(token);

    expect(principal).toBeNull();
  });

  it("returns null when DB row owner address is invalid", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
    };
    mocks.getRedisClient.mockResolvedValue(redis);
    mockDbTokenLookup([
      {
        id: 31n,
        ownerAddress: "invalid-address",
        agentKey: "ops",
        canWrite: false,
      },
    ]);

    const principal = await authenticateToolsBearerToken(token);

    expect(principal).toBeNull();
  });

  it("continues with DB auth when redis read fails", async () => {
    mocks.getRedisClient
      .mockRejectedValueOnce(new Error("redis down"))
      .mockResolvedValueOnce({
        set: vi.fn().mockResolvedValue("OK"),
      })
      .mockResolvedValueOnce({
        set: vi.fn().mockResolvedValue("OK"),
      });
    mockDbTokenLookup([
      {
        id: 41n,
        ownerAddress: "0x0000000000000000000000000000000000000003",
        agentKey: "fallback",
        canWrite: false,
      },
    ]);
    mocks.update.mockReturnValue({
      set: () => ({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const principal = await authenticateToolsBearerToken(token);
    await flushTasks();

    expect(principal).toEqual({
      tokenId: "41",
      ownerAddress: "0x0000000000000000000000000000000000000003",
      agentKey: "fallback",
      canWrite: false,
    });
  });

  it("skips DB last_used update when redis throttle lock is not acquired", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          tokenId: "51",
          ownerAddress: "0x0000000000000000000000000000000000000004",
          agentKey: "readonly",
          canWrite: false,
        }),
      ),
      set: vi.fn().mockResolvedValue(null),
    };
    mocks.getRedisClient.mockResolvedValue(redis);
    const where = vi.fn().mockResolvedValue(undefined);
    mocks.update.mockReturnValue({
      set: () => ({ where }),
    });

    const principal = await authenticateToolsBearerToken(token);
    await flushTasks();

    expect(principal).toEqual({
      tokenId: "51",
      ownerAddress: "0x0000000000000000000000000000000000000004",
      agentKey: "readonly",
      canWrite: false,
    });
    expect(where).not.toHaveBeenCalled();
  });

  it("swallows DB last_used update failures without failing auth", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          tokenId: "61",
          ownerAddress: "0x0000000000000000000000000000000000000005",
          agentKey: "writer",
          canWrite: true,
        }),
      ),
      set: vi.fn().mockResolvedValue("OK"),
    };
    mocks.getRedisClient.mockResolvedValue(redis);
    const where = vi.fn().mockRejectedValue(new Error("write fail"));
    mocks.update.mockReturnValue({
      set: () => ({ where }),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const principal = await authenticateToolsBearerToken(token);
    await flushTasks();

    expect(principal).toEqual({
      tokenId: "61",
      ownerAddress: "0x0000000000000000000000000000000000000005",
      agentKey: "writer",
      canWrite: true,
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("skips DB write when redis throttle lock check throws", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          tokenId: "71",
          ownerAddress: "0x0000000000000000000000000000000000000006",
          agentKey: "writer",
          canWrite: true,
        }),
      ),
      set: vi.fn().mockRejectedValue(new Error("redis lock fail")),
    };
    mocks.getRedisClient.mockResolvedValue(redis);
    const where = vi.fn().mockResolvedValue(undefined);
    mocks.update.mockReturnValue({
      set: () => ({ where }),
    });

    const principal = await authenticateToolsBearerToken(token);
    await flushTasks();

    expect(principal).toEqual({
      tokenId: "71",
      ownerAddress: "0x0000000000000000000000000000000000000006",
      agentKey: "writer",
      canWrite: true,
    });
    expect(where).not.toHaveBeenCalled();
  });
});
