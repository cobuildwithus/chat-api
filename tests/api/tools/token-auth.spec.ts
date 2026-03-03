import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateToolsBearerToken } from "../../../src/api/tools/token-auth";

const mocks = vi.hoisted(() => ({
  verifyCliAccessToken: vi.fn(),
}));

vi.mock("../../../src/api/oauth/jwt", () => ({
  verifyCliAccessToken: (...args: unknown[]) => mocks.verifyCliAccessToken(...args),
}));

describe("authenticateToolsBearerToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when JWT verification fails", async () => {
    mocks.verifyCliAccessToken.mockResolvedValueOnce(null);

    await expect(authenticateToolsBearerToken("invalid")).resolves.toBeNull();
  });

  it("returns null when JWT subject is not a valid address", async () => {
    mocks.verifyCliAccessToken.mockResolvedValueOnce({
      sub: "bad",
      sid: "sid-1",
      agentKey: "default",
      scope: "tools:read offline_access",
      iat: 1,
      exp: 2,
      iss: "issuer",
      aud: "audience",
    });

    await expect(authenticateToolsBearerToken("token")).resolves.toBeNull();
  });

  it("returns null when JWT scope is blank", async () => {
    mocks.verifyCliAccessToken.mockResolvedValueOnce({
      sub: "0x0000000000000000000000000000000000000001",
      sid: "sid-1",
      agentKey: "default",
      scope: "   ",
      iat: 1,
      exp: 2,
      iss: "issuer",
      aud: "audience",
    });

    await expect(authenticateToolsBearerToken("token")).resolves.toBeNull();
  });

  it("returns principal claims derived from a valid JWT", async () => {
    mocks.verifyCliAccessToken.mockResolvedValueOnce({
      sub: "0x0000000000000000000000000000000000000001",
      sid: "42",
      agentKey: "ops",
      scope: "tools:read tools:write wallet:read offline_access",
      iat: 1,
      exp: 2,
      iss: "issuer",
      aud: "audience",
    });

    await expect(authenticateToolsBearerToken("token")).resolves.toEqual({
      sessionId: "42",
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "ops",
      scope: "tools:read tools:write wallet:read offline_access",
      scopes: ["tools:read", "tools:write", "wallet:read", "offline_access"],
      hasToolsRead: true,
      hasToolsWrite: true,
      hasWalletExecute: false,
      hasAnyWriteScope: true,
    });
  });

  it("derives explicit write capabilities from wallet:execute scope", async () => {
    mocks.verifyCliAccessToken.mockResolvedValueOnce({
      sub: "0x0000000000000000000000000000000000000001",
      sid: "43",
      agentKey: "ops",
      scope: "tools:read wallet:execute offline_access",
      iat: 1,
      exp: 2,
      iss: "issuer",
      aud: "audience",
    });

    await expect(authenticateToolsBearerToken("token")).resolves.toMatchObject({
      sessionId: "43",
      hasToolsRead: true,
      hasToolsWrite: false,
      hasWalletExecute: true,
      hasAnyWriteScope: true,
    });
  });
});
