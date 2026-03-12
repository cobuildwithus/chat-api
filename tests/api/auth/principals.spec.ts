import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestContext } from "@fastify/request-context";
import {
  getToolsPrincipal,
  resolveSubjectWalletFromContext,
  setChatUserPrincipal,
  setChatUserPrincipalFromRequest,
  setToolsPrincipal,
} from "../../../src/api/auth/principals";
import { resetEnvCacheForTests } from "../../../src/config/env";

const mocks = vi.hoisted(() => ({
  requestContextGet: vi.fn(),
  requestContextSet: vi.fn(),
}));

vi.mock("@fastify/request-context", () => ({
  requestContext: {
    get: (...args: unknown[]) => mocks.requestContextGet(...args),
    set: (...args: unknown[]) => mocks.requestContextSet(...args),
  },
}));

describe("auth principals", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.CHAT_TRUST_PROXY;
    resetEnvCacheForTests();
    mocks.requestContextGet.mockReturnValue(undefined);
  });

  it("stores a chat user principal from request headers when geo metadata comes from a trusted proxy", () => {
    process.env.CHAT_TRUST_PROXY = "1";
    resetEnvCacheForTests();

    setChatUserPrincipalFromRequest("0x0000000000000000000000000000000000000001", {
      headers: {
        city: "Paris",
        country: "FR",
        "country-region": "IDF",
        "user-agent": "agent",
      },
    });

    expect(mocks.requestContextSet).toHaveBeenCalledWith("user", {
      address: "0x0000000000000000000000000000000000000001",
      city: "Paris",
      country: "FR",
      countryRegion: "IDF",
      userAgent: "agent",
    });
  });

  it("normalizes direct chat user principal addresses before storing them", () => {
    setChatUserPrincipal({
      address: "0x00000000000000000000000000000000000000AA",
      city: null,
      country: null,
      countryRegion: null,
      userAgent: null,
    });

    expect(mocks.requestContextSet).toHaveBeenCalledWith("user", {
      address: "0x00000000000000000000000000000000000000aa",
      city: null,
      country: null,
      countryRegion: null,
      userAgent: null,
    });
  });

  it("rejects invalid direct chat user principal addresses", () => {
    expect(() =>
      setChatUserPrincipal({
        address: "not-an-address",
        city: null,
        country: null,
        countryRegion: null,
        userAgent: null,
      }),
    ).toThrow("Invalid user address");
    expect(mocks.requestContextSet).not.toHaveBeenCalled();
  });

  it("drops geo headers when trust proxy is not configured", () => {
    setChatUserPrincipalFromRequest("0x0000000000000000000000000000000000000001", {
      headers: {
        city: "Paris",
        country: "FR",
        "country-region": "IDF",
        "user-agent": "agent",
      },
    });

    expect(mocks.requestContextSet).toHaveBeenCalledWith("user", {
      address: "0x0000000000000000000000000000000000000001",
      city: null,
      country: null,
      countryRegion: null,
      userAgent: "agent",
    });
  });

  it("normalizes and derives tools principal flags from context", () => {
    mocks.requestContextGet.mockImplementation((key: string) => {
      if (key === "toolsPrincipal") {
        return {
          ownerAddress: "0x00000000000000000000000000000000000000AA",
          agentKey: "ops",
          scopes: ["tools:read", "wallet:execute"],
        };
      }
      return undefined;
    });

    expect(getToolsPrincipal()).toEqual({
      sessionId: "",
      ownerAddress: "0x00000000000000000000000000000000000000aa",
      agentKey: "ops",
      scope: "tools:read wallet:execute",
      scopes: ["tools:read", "wallet:execute"],
      hasToolsRead: true,
      hasToolsWrite: false,
      hasWalletExecute: true,
      hasAnyWriteScope: true,
    });
  });

  it("does not fall back to the chat user when a partial tools principal is present", () => {
    mocks.requestContextGet.mockImplementation((key: string) => {
      if (key === "toolsPrincipal") {
        return {
          ownerAddress: "not-an-address",
          agentKey: "ops",
        };
      }
      if (key === "user") {
        return {
          address: "0x0000000000000000000000000000000000000002",
        };
      }
      return undefined;
    });

    expect(resolveSubjectWalletFromContext({ allowUserFallback: true })).toBeNull();
  });

  it("falls back to the chat user only when allowed and no tools principal exists", () => {
    mocks.requestContextGet.mockImplementation((key: string) => {
      if (key === "toolsPrincipal") {
        return undefined;
      }
      if (key === "user") {
        return {
          address: "0x0000000000000000000000000000000000000003",
        };
      }
      return undefined;
    });

    expect(resolveSubjectWalletFromContext()).toBeNull();
    expect(resolveSubjectWalletFromContext({ allowUserFallback: true })).toBe(
      "0x0000000000000000000000000000000000000003",
    );
  });

  it("copies scopes when storing a tools principal", () => {
    const principal = {
      sessionId: "42",
      ownerAddress: "0x0000000000000000000000000000000000000004" as const,
      agentKey: "default",
      scope: "tools:read",
      scopes: ["tools:read"],
      hasToolsRead: true,
      hasToolsWrite: false,
      hasWalletExecute: false,
      hasAnyWriteScope: false,
    };

    setToolsPrincipal(principal);
    principal.scopes.push("wallet:execute");

    expect(mocks.requestContextSet).toHaveBeenCalledWith("toolsPrincipal", {
      sessionId: "42",
      ownerAddress: "0x0000000000000000000000000000000000000004",
      agentKey: "default",
      scope: "tools:read",
      scopes: ["tools:read"],
      hasToolsRead: true,
      hasToolsWrite: false,
      hasWalletExecute: false,
      hasAnyWriteScope: false,
    });
  });
});
