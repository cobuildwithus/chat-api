import { beforeEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.fn();
const fromMock = vi.fn();
const whereMock = vi.fn();
const limitMock = vi.fn();

vi.mock("../../../../../src/infra/db/cobuildDb", () => ({
  cobuildPrimaryDb: () => ({
    select: (...args: unknown[]) => selectMock(...args),
  }),
}));

describe("readHostedCliWalletAddress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectMock.mockReturnValue({
      from: (...args: unknown[]) => fromMock(...args),
    });
    fromMock.mockReturnValue({
      where: (...args: unknown[]) => whereMock(...args),
    });
    whereMock.mockReturnValue({
      limit: (...args: unknown[]) => limitMock(...args),
    });
  });

  it("returns the normalized hosted wallet address for the owner and agent key", async () => {
    limitMock.mockResolvedValueOnce([
      {
        address: "0x000000000000000000000000000000000000000A",
      },
    ]);

    const { readHostedCliWalletAddress } = await import(
      "../../../../../src/infra/db/queries/cli-wallet/read-hosted-wallet-address"
    );

    await expect(
      readHostedCliWalletAddress({
        ownerAddress: "0x0000000000000000000000000000000000000001",
        agentKey: "agent-1",
      }),
    ).resolves.toBe("0x000000000000000000000000000000000000000a");

    expect(limitMock).toHaveBeenCalledWith(1);
  });

  it("returns null when the hosted wallet is missing", async () => {
    limitMock.mockResolvedValueOnce([]);

    const { readHostedCliWalletAddress } = await import(
      "../../../../../src/infra/db/queries/cli-wallet/read-hosted-wallet-address"
    );

    await expect(
      readHostedCliWalletAddress({
        ownerAddress: "0x0000000000000000000000000000000000000001",
        agentKey: "agent-1",
      }),
    ).resolves.toBeNull();
  });
});
