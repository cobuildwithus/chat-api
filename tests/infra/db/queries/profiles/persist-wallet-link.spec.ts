import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspect } from "node:util";

const insertMock = vi.fn();
const valuesMock = vi.fn();
const onConflictDoUpdateMock = vi.fn();

vi.mock("../../../../../src/infra/db/cobuildDb", () => ({
  cobuildPrimaryDb: () => ({
    insert: (...args: unknown[]) => insertMock(...args),
  }),
}));

describe("persistFarcasterWalletLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockReturnValue({
      values: (...args: unknown[]) => valuesMock(...args),
    });
    valuesMock.mockReturnValue({
      onConflictDoUpdate: (...args: unknown[]) => onConflictDoUpdateMock(...args),
    });
    onConflictDoUpdateMock.mockResolvedValue(undefined);
  });

  it("inserts a normalized address and updates both verified arrays on conflict", async () => {
    const { farcasterProfiles } = await import("../../../../../src/infra/db/schema");
    const { persistFarcasterWalletLink } = await import(
      "../../../../../src/infra/db/queries/profiles/persist-wallet-link"
    );

    const result = await persistFarcasterWalletLink({
      fid: 123,
      address: "0x000000000000000000000000000000000000000A",
    });

    expect(result).toEqual({
      fid: 123,
      address: "0x000000000000000000000000000000000000000a",
    });
    expect(insertMock).toHaveBeenCalledWith(farcasterProfiles);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fid: 123,
        verifiedAddresses: ["0x000000000000000000000000000000000000000a"],
        manualVerifiedAddresses: ["0x000000000000000000000000000000000000000a"],
        updatedAt: expect.any(Date),
      }),
    );

    const conflictArgs = onConflictDoUpdateMock.mock.calls[0]?.[0] as {
      target: unknown;
      set: {
        verifiedAddresses: unknown;
        manualVerifiedAddresses: unknown;
        updatedAt: Date;
      };
    };
    expect(conflictArgs.target).toBe(farcasterProfiles.fid);
    expect(conflictArgs.set.updatedAt).toBeInstanceOf(Date);
    const verifiedAddressesSql = inspect(conflictArgs.set.verifiedAddresses, { depth: 10 });
    const manualVerifiedAddressesSql = inspect(conflictArgs.set.manualVerifiedAddresses, {
      depth: 10,
    });
    expect(verifiedAddressesSql).toContain("manual_verified_addresses");
    expect(verifiedAddressesSql).toContain("verified_addresses");
    expect(manualVerifiedAddressesSql).toContain("manual_verified_addresses");
  });

  it("rejects invalid fids before touching the database", async () => {
    const { persistFarcasterWalletLink } = await import(
      "../../../../../src/infra/db/queries/profiles/persist-wallet-link"
    );

    await expect(
      persistFarcasterWalletLink({
        fid: 0,
        address: "0x0000000000000000000000000000000000000001",
      }),
    ).rejects.toThrow("Invalid Farcaster fid.");

    expect(insertMock).not.toHaveBeenCalled();
  });
});
