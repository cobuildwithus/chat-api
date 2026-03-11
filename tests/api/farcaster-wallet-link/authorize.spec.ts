import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReply } from "../../utils/fastify";

const mocks = vi.hoisted(() => ({
  getToolsPrincipal: vi.fn(),
  readHostedCliWalletAddress: vi.fn(),
  createPublicClient: vi.fn(),
  http: vi.fn(),
}));

vi.mock("../../../src/api/auth/principals", () => ({
  getToolsPrincipal: mocks.getToolsPrincipal,
}));

vi.mock("../../../src/infra/db/queries/cli-wallet/read-hosted-wallet-address", () => ({
  readHostedCliWalletAddress: mocks.readHostedCliWalletAddress,
}));

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: mocks.createPublicClient,
    http: mocks.http,
  };
});

import { authorizeFarcasterWalletLink } from "../../../src/api/farcaster-wallet-link/authorize";

describe("authorizeFarcasterWalletLink", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.COBUILD_OPTIMISM_RPC_URL;
    mocks.http.mockReturnValue("transport");
  });

  it("authorizes a local signup wallet when the owner wallet matches and owns the fid onchain", async () => {
    process.env.COBUILD_OPTIMISM_RPC_URL = "https://optimism.example";
    mocks.getToolsPrincipal.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "agent-1",
    });
    const readContract = vi.fn().mockResolvedValue(123n);
    mocks.createPublicClient.mockReturnValue({ readContract });
    const reply = createReply();

    await expect(
      authorizeFarcasterWalletLink({
        fid: 123,
        address: "0x0000000000000000000000000000000000000001",
        reply,
      }),
    ).resolves.toBe(true);

    expect(mocks.readHostedCliWalletAddress).not.toHaveBeenCalled();
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "idOf",
        args: ["0x0000000000000000000000000000000000000001"],
      }),
    );
    expect(mocks.http).toHaveBeenCalledWith("https://optimism.example", {
      timeout: 7_000,
      retryCount: 1,
    });
    expect(reply.status).not.toHaveBeenCalled();
  });

  it("authorizes a hosted signup wallet when it matches the stored hosted agent wallet", async () => {
    mocks.getToolsPrincipal.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "agent-1",
    });
    mocks.readHostedCliWalletAddress.mockResolvedValueOnce(
      "0x0000000000000000000000000000000000000002",
    );
    const readContract = vi.fn().mockResolvedValue(456n);
    mocks.createPublicClient.mockReturnValue({ readContract });
    const reply = createReply();

    await expect(
      authorizeFarcasterWalletLink({
        fid: 456,
        address: "0x0000000000000000000000000000000000000002",
        reply,
      }),
    ).resolves.toBe(true);

    expect(mocks.readHostedCliWalletAddress).toHaveBeenCalledWith({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "agent-1",
    });
    expect(reply.status).not.toHaveBeenCalled();
  });

  it("rejects wallet links for addresses outside the authenticated CLI session", async () => {
    mocks.getToolsPrincipal.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "agent-1",
    });
    mocks.readHostedCliWalletAddress.mockResolvedValueOnce(
      "0x0000000000000000000000000000000000000002",
    );
    const reply = createReply();

    await expect(
      authorizeFarcasterWalletLink({
        fid: 123,
        address: "0x0000000000000000000000000000000000000003",
        reply,
      }),
    ).resolves.toBe(false);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Wallet link request is not authorized for this CLI session.",
    });
    expect(mocks.createPublicClient).not.toHaveBeenCalled();
  });

  it("rejects wallet links when the wallet does not own the supplied fid onchain", async () => {
    mocks.getToolsPrincipal.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "agent-1",
    });
    const readContract = vi.fn().mockResolvedValue(999n);
    mocks.createPublicClient.mockReturnValue({ readContract });
    const reply = createReply();

    await expect(
      authorizeFarcasterWalletLink({
        fid: 123,
        address: "0x0000000000000000000000000000000000000001",
        reply,
      }),
    ).resolves.toBe(false);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Wallet link request is not authorized for this CLI session.",
    });
  });

  it("returns 502 when onchain Farcaster ownership verification fails", async () => {
    mocks.getToolsPrincipal.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "agent-1",
    });
    const readContract = vi.fn().mockRejectedValue(new Error("rpc down"));
    mocks.createPublicClient.mockReturnValue({ readContract });
    const reply = createReply();

    await expect(
      authorizeFarcasterWalletLink({
        fid: 123,
        address: "0x0000000000000000000000000000000000000001",
        reply,
      }),
    ).resolves.toBe(false);

    expect(reply.status).toHaveBeenCalledWith(502);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Farcaster wallet ownership verification unavailable.",
    });
  });

  it("returns 401 when the tools principal is missing", async () => {
    mocks.getToolsPrincipal.mockReturnValue(null);
    const reply = createReply();

    await expect(
      authorizeFarcasterWalletLink({
        fid: 123,
        address: "0x0000000000000000000000000000000000000001",
        reply,
      }),
    ).resolves.toBe(false);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Authenticated tools principal is required for this tool.",
    });
    expect(mocks.createPublicClient).not.toHaveBeenCalled();
  });
});
