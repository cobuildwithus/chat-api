import { beforeEach, describe, expect, it, vi } from "vitest";

const redisGet = vi.fn();
const redisSet = vi.fn();
const redisDel = vi.fn();

const whereMock = vi.fn();
const fromMock = vi.fn(() => ({ where: whereMock }));

vi.mock("../../../../src/infra/redis", () => ({
  getRedisClient: vi.fn(async () => ({
    get: redisGet,
    set: redisSet,
    del: redisDel,
  })),
}));

vi.mock("../../../../src/infra/db/cobuildDb", () => ({
  cobuildDb: {
    select: () => ({ from: fromMock }),
  },
}));

describe("getFarcasterProfileByAddress", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("../../../../src/infra/db/queries/profiles/get-profile");
  });

  it("returns cached profile when available", async () => {
    redisGet.mockResolvedValueOnce(JSON.stringify({ fid: 1, fname: "alice" }));

    const { getFarcasterProfileByAddress } = await import(
      "../../../../src/infra/db/queries/profiles/get-profile"
    );

    const result = await getFarcasterProfileByAddress("0xabc");
    expect(result).toEqual({ fid: 1, fname: "alice" });
  });

  it("clears invalid cache and queries db", async () => {
    redisGet.mockResolvedValueOnce(JSON.stringify({ fid: 0 }));
    whereMock.mockResolvedValueOnce([
      { fid: 2, fname: "bob", updatedAt: 2 },
      { fid: 3, fname: "carol", updatedAt: 5 },
    ]);

    const { getFarcasterProfileByAddress } = await import(
      "../../../../src/infra/db/queries/profiles/get-profile"
    );

    const result = await getFarcasterProfileByAddress("0xabc");
    expect(redisDel).toHaveBeenCalled();
    expect(result?.fid).toBe(3);
    expect(redisSet).toHaveBeenCalled();
  });

  it("returns null when no profiles found", async () => {
    redisGet.mockResolvedValueOnce(null);
    whereMock.mockResolvedValueOnce([]);

    const { getFarcasterProfileByAddress } = await import(
      "../../../../src/infra/db/queries/profiles/get-profile"
    );

    const result = await getFarcasterProfileByAddress("0xabc");
    expect(result).toBeNull();
  });

  it("handles errors gracefully", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    redisGet.mockRejectedValueOnce(new Error("boom"));

    const { getFarcasterProfileByAddress } = await import(
      "../../../../src/infra/db/queries/profiles/get-profile"
    );

    const result = await getFarcasterProfileByAddress("0xabc");
    expect(result).toBeNull();
    errorSpy.mockRestore();
  });
});
