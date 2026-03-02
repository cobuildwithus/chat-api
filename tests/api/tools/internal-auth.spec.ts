import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { enforceToolsBearerAuth } from "../../../src/api/tools/internal-auth";
import { createReply } from "../../utils/fastify";

const mocks = vi.hoisted(() => ({
  authenticateToolsBearerToken: vi.fn(),
}));

vi.mock("../../../src/api/tools/token-auth", () => ({
  authenticateToolsBearerToken: mocks.authenticateToolsBearerToken,
}));

describe("enforceToolsBearerAuth", () => {
  it("returns 401 when authorization header is missing", async () => {
    mocks.authenticateToolsBearerToken.mockReset();
    const request = {
      ip: "127.0.0.1",
      headers: {},
    } as unknown as FastifyRequest;
    const reply = createReply();

    await enforceToolsBearerAuth(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Unauthorized." });
    expect(mocks.authenticateToolsBearerToken).not.toHaveBeenCalled();
  });

  it("returns 401 when authorization header is not bearer", async () => {
    mocks.authenticateToolsBearerToken.mockReset();
    const request = {
      ip: "127.0.0.1",
      headers: { authorization: "Basic token" },
    } as unknown as FastifyRequest;
    const reply = createReply();

    await enforceToolsBearerAuth(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Unauthorized." });
    expect(mocks.authenticateToolsBearerToken).not.toHaveBeenCalled();
  });

  it("returns 401 when token auth fails", async () => {
    mocks.authenticateToolsBearerToken.mockReset();
    const request = {
      ip: "127.0.0.1",
      headers: { authorization: "Bearer bbt_invalid" },
    } as unknown as FastifyRequest;
    const reply = createReply();
    mocks.authenticateToolsBearerToken.mockResolvedValueOnce(null);

    await enforceToolsBearerAuth(request, reply);

    expect(mocks.authenticateToolsBearerToken).toHaveBeenCalledWith("bbt_invalid");
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Unauthorized." });
  });

  it("passes when token auth succeeds", async () => {
    mocks.authenticateToolsBearerToken.mockReset();
    const request = {
      ip: "127.0.0.1",
      headers: { authorization: "Bearer bbt_valid" },
    } as unknown as FastifyRequest;
    const reply = createReply();
    mocks.authenticateToolsBearerToken.mockResolvedValueOnce({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
    });

    await enforceToolsBearerAuth(request, reply);

    expect(mocks.authenticateToolsBearerToken).toHaveBeenCalledWith("bbt_valid");
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});
