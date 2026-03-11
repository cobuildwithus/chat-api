import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleFarcasterWalletLinkRequest } from "../../../src/api/farcaster-wallet-link/route";
import { createReply } from "../../utils/fastify";

const mocks = vi.hoisted(() => ({
  authorizeFarcasterWalletLink: vi.fn(),
  persistFarcasterWalletLink: vi.fn(),
}));

vi.mock("../../../src/api/farcaster-wallet-link/authorize", () => ({
  authorizeFarcasterWalletLink: mocks.authorizeFarcasterWalletLink,
}));

vi.mock("../../../src/infra/db/queries/profiles/persist-wallet-link", () => ({
  persistFarcasterWalletLink: mocks.persistFarcasterWalletLink,
}));

describe("handleFarcasterWalletLinkRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists the wallet link and returns the normalized payload", async () => {
    mocks.authorizeFarcasterWalletLink.mockResolvedValueOnce(true);
    mocks.persistFarcasterWalletLink.mockResolvedValueOnce({
      fid: 123,
      address: "0x0000000000000000000000000000000000000001",
    });
    const reply = createReply();

    await handleFarcasterWalletLinkRequest(
      {
        body: {
          fid: "123",
          address: " 0x0000000000000000000000000000000000000001 ",
        },
      } as FastifyRequest,
      reply,
    );

    expect(mocks.authorizeFarcasterWalletLink).toHaveBeenCalledWith({
      fid: 123,
      address: "0x0000000000000000000000000000000000000001",
      reply,
    });
    expect(mocks.persistFarcasterWalletLink).toHaveBeenCalledWith({
      fid: 123,
      address: "0x0000000000000000000000000000000000000001",
    });
    expect(reply.send).toHaveBeenCalledWith({
      ok: true,
      fid: 123,
      address: "0x0000000000000000000000000000000000000001",
    });
  });

  it("stops before persistence when authorization fails", async () => {
    mocks.authorizeFarcasterWalletLink.mockResolvedValueOnce(false);
    const reply = createReply();

    await handleFarcasterWalletLinkRequest(
      {
        body: {
          fid: "123",
          address: "0x0000000000000000000000000000000000000001",
        },
      } as FastifyRequest,
      reply,
    );

    expect(mocks.persistFarcasterWalletLink).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});
