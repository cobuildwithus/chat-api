import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrSetCachedResultWithLock = vi.fn();
const deleteCachedResult = vi.fn();
const whereMock = vi.fn();
const fromMock = vi.fn(() => ({ where: whereMock }));

vi.mock("../../../../src/infra/cache/cacheResult", () => ({
  getOrSetCachedResultWithLock,
  deleteCachedResult,
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

  it("returns a valid cached/fetched profile", async () => {
    getOrSetCachedResultWithLock.mockResolvedValueOnce({ fid: 1, fname: "alice" });

    const { getFarcasterProfileByAddress } = await import(
      "../../../../src/infra/db/queries/profiles/get-profile"
    );

    const result = await getFarcasterProfileByAddress("0xabc");
    expect(result).toEqual({ fid: 1, fname: "alice" });
    expect(deleteCachedResult).not.toHaveBeenCalled();
  });

  it("clears invalid profile cache entries and reloads once", async () => {
    getOrSetCachedResultWithLock
      .mockResolvedValueOnce({ fid: 0, fname: "invalid" })
      .mockResolvedValueOnce({ fid: 3, fname: "carol" });

    const { getFarcasterProfileByAddress } = await import(
      "../../../../src/infra/db/queries/profiles/get-profile"
    );

    const result = await getFarcasterProfileByAddress("0xabc");
    expect(result).toEqual({ fid: 3, fname: "carol" });
    expect(deleteCachedResult).toHaveBeenCalledWith("0xabc", "farcaster-profile-by-address:");
    expect(getOrSetCachedResultWithLock).toHaveBeenCalledTimes(2);
  });

  it("returns null when cache/fetch has no profile", async () => {
    getOrSetCachedResultWithLock.mockResolvedValueOnce(null);

    const { getFarcasterProfileByAddress } = await import(
      "../../../../src/infra/db/queries/profiles/get-profile"
    );

    const result = await getFarcasterProfileByAddress("0xabc");
    expect(result).toBeNull();
  });

  it("queries db and returns newest profile when cache misses", async () => {
    getOrSetCachedResultWithLock.mockImplementationOnce(
      async (
        _key: string,
        _prefix: string,
        fetchFn: () => Promise<unknown>
      ) => await fetchFn()
    );
    whereMock.mockResolvedValueOnce([
      { fid: 2, fname: "bob", updatedAt: 2 },
      { fid: 3, fname: "carol", updatedAt: 5 },
    ]);

    const { getFarcasterProfileByAddress } = await import(
      "../../../../src/infra/db/queries/profiles/get-profile"
    );

    const result = await getFarcasterProfileByAddress("0xabc");
    expect(result).toEqual({ fid: 3, fname: "carol", updatedAt: 5 });
    expect(fromMock).toHaveBeenCalled();
    expect(whereMock).toHaveBeenCalled();
  });

  it("returns null when cache misses and db has no rows", async () => {
    getOrSetCachedResultWithLock.mockImplementationOnce(
      async (
        _key: string,
        _prefix: string,
        fetchFn: () => Promise<unknown>
      ) => await fetchFn()
    );
    whereMock.mockResolvedValueOnce([]);

    const { getFarcasterProfileByAddress } = await import(
      "../../../../src/infra/db/queries/profiles/get-profile"
    );

    const result = await getFarcasterProfileByAddress("0xabc");
    expect(result).toBeNull();
  });

  it("returns null when refreshed profile is still invalid", async () => {
    getOrSetCachedResultWithLock
      .mockResolvedValueOnce({ fid: 0, fname: "invalid" })
      .mockResolvedValueOnce({ fid: 0, fname: "still-invalid" });

    const { getFarcasterProfileByAddress } = await import(
      "../../../../src/infra/db/queries/profiles/get-profile"
    );

    const result = await getFarcasterProfileByAddress("0xabc");
    expect(result).toBeNull();
    expect(deleteCachedResult).toHaveBeenCalledWith("0xabc", "farcaster-profile-by-address:");
  });

  it("handles errors gracefully", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getOrSetCachedResultWithLock.mockRejectedValueOnce(new Error("boom"));

    const { getFarcasterProfileByAddress } = await import(
      "../../../../src/infra/db/queries/profiles/get-profile"
    );

    const result = await getFarcasterProfileByAddress("0xabc");
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
