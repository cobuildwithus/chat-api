import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { enforceToolsBearerAuth } from "../../../src/api/tools/internal-auth";
import { createReply } from "../../utils/fastify";

const mocks = vi.hoisted(() => ({
  authenticateToolsBearerToken: vi.fn(),
  requestContextSet: vi.fn(),
}));

vi.mock("../../../src/api/tools/token-auth", () => ({
  authenticateToolsBearerToken: mocks.authenticateToolsBearerToken,
}));

vi.mock("@fastify/request-context", () => ({
  requestContext: {
    set: (...args: unknown[]) => mocks.requestContextSet(...args),
  },
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

  it("returns 401 when bearer token is empty after trimming", async () => {
    mocks.authenticateToolsBearerToken.mockReset();
    const request = {
      ip: "127.0.0.1",
      headers: { authorization: "Bearer   " },
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
      sessionId: "42",
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
      scope: "tools:read tools:write wallet:read offline_access",
      scopes: ["tools:read", "tools:write", "wallet:read", "offline_access"],
      hasToolsRead: true,
      hasToolsWrite: true,
      hasWalletExecute: false,
      hasAnyWriteScope: true,
    });

    await enforceToolsBearerAuth(request, reply);

    expect(mocks.authenticateToolsBearerToken).toHaveBeenCalledWith("bbt_valid");
    expect(mocks.requestContextSet).toHaveBeenCalledWith("user", {
      address: "0x0000000000000000000000000000000000000001",
      city: null,
      country: null,
      countryRegion: null,
      userAgent: null,
    });
    expect(mocks.requestContextSet).toHaveBeenCalledWith("toolsPrincipal", {
      sessionId: "42",
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
      scope: "tools:read tools:write wallet:read offline_access",
      scopes: ["tools:read", "tools:write", "wallet:read", "offline_access"],
      hasToolsRead: true,
      hasToolsWrite: true,
      hasWalletExecute: false,
      hasAnyWriteScope: true,
    });
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it("stores geo/user-agent metadata when headers are present", async () => {
    mocks.authenticateToolsBearerToken.mockReset();
    const request = {
      ip: "127.0.0.1",
      headers: {
        authorization: "Bearer bbt_valid",
        city: "New York",
        country: "US",
        "country-region": "NY",
        "user-agent": "test-agent",
      },
    } as unknown as FastifyRequest;
    const reply = createReply();
    mocks.authenticateToolsBearerToken.mockResolvedValueOnce({
      sessionId: "43",
      ownerAddress: "0x0000000000000000000000000000000000000002",
      agentKey: "ops",
      scope: "tools:read wallet:read offline_access",
      scopes: ["tools:read", "wallet:read", "offline_access"],
      hasToolsRead: true,
      hasToolsWrite: false,
      hasWalletExecute: false,
      hasAnyWriteScope: false,
    });

    await enforceToolsBearerAuth(request, reply);

    expect(mocks.requestContextSet).toHaveBeenCalledWith("user", {
      address: "0x0000000000000000000000000000000000000002",
      city: "New York",
      country: "US",
      countryRegion: "NY",
      userAgent: "test-agent",
    });
  });

  it("returns 403 when token is valid but missing tools:read", async () => {
    mocks.authenticateToolsBearerToken.mockReset();
    mocks.requestContextSet.mockReset();
    const request = {
      ip: "127.0.0.1",
      headers: { authorization: "Bearer bbt_valid" },
    } as unknown as FastifyRequest;
    const reply = createReply();
    mocks.authenticateToolsBearerToken.mockResolvedValueOnce({
      sessionId: "44",
      ownerAddress: "0x0000000000000000000000000000000000000003",
      agentKey: "ops",
      scope: "wallet:read offline_access",
      scopes: ["wallet:read", "offline_access"],
      hasToolsRead: false,
      hasToolsWrite: false,
      hasWalletExecute: false,
      hasAnyWriteScope: false,
    });

    await enforceToolsBearerAuth(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: "tools:read scope required." });
    expect(mocks.requestContextSet).not.toHaveBeenCalled();
  });
});
