import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  normalizeAddress: vi.fn(),
  cobuildPrimaryDb: vi.fn(),
  createAuthCode: vi.fn(),
  createRefreshToken: vi.fn(),
  digestOAuthSecret: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  desc: (...args: unknown[]) => ({ desc: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  gt: (...args: unknown[]) => ({ gt: args }),
  isNull: (...args: unknown[]) => ({ isNull: args }),
}));

vi.mock("../../../src/chat/address", () => ({
  normalizeAddress: (...args: unknown[]) => mocks.normalizeAddress(...args),
}));

vi.mock("../../../src/infra/db/cobuildDb", () => ({
  cobuildPrimaryDb: (...args: unknown[]) => mocks.cobuildPrimaryDb(...args),
}));

vi.mock("../../../src/infra/db/schema", () => ({
  cliOauthCodes: {
    id: "cli_oauth_codes.id",
    codeHash: "cli_oauth_codes.code_hash",
    ownerAddress: "cli_oauth_codes.owner_address",
    agentKey: "cli_oauth_codes.agent_key",
    scope: "cli_oauth_codes.scope",
    redirectUri: "cli_oauth_codes.redirect_uri",
    codeChallenge: "cli_oauth_codes.code_challenge",
    codeChallengeMethod: "cli_oauth_codes.code_challenge_method",
    label: "cli_oauth_codes.label",
    usedAt: "cli_oauth_codes.used_at",
    expiresAt: "cli_oauth_codes.expires_at",
  },
  cliSessions: {
    id: "cli_sessions.id",
    ownerAddress: "cli_sessions.owner_address",
    agentKey: "cli_sessions.agent_key",
    scope: "cli_sessions.scope",
    label: "cli_sessions.label",
    refreshTokenHash: "cli_sessions.refresh_token_hash",
    createdAt: "cli_sessions.created_at",
    lastUsedAt: "cli_sessions.last_used_at",
    revokedAt: "cli_sessions.revoked_at",
    expiresAt: "cli_sessions.expires_at",
  },
}));

vi.mock("../../../src/api/oauth/security", () => ({
  OAUTH_AUTH_CODE_TTL_MS: 5 * 60_000,
  OAUTH_REFRESH_TOKEN_TTL_MS: 60 * 24 * 60 * 60_000,
  createAuthCode: (...args: unknown[]) => mocks.createAuthCode(...args),
  createRefreshToken: (...args: unknown[]) => mocks.createRefreshToken(...args),
  digestOAuthSecret: (...args: unknown[]) => mocks.digestOAuthSecret(...args),
}));

import {
  consumeAuthorizationCodeWithPkce,
  createAuthorizationCode,
  createCliSession,
  listCliSessions,
  revokeCliSession,
  rotateCliSessionByRefreshToken,
} from "../../../src/api/oauth/store";

type DbMock = ReturnType<typeof createDbMock>;

function createDbMock() {
  const insertReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const selectOrderBy = vi.fn();
  const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  return {
    db: {
      insert,
      update,
      select,
    },
    insert,
    insertValues,
    insertReturning,
    update,
    updateSet,
    updateWhere,
    updateReturning,
    select,
    selectFrom,
    selectWhere,
    selectOrderBy,
  };
}

describe("oauth store", () => {
  let dbMock: DbMock;
  const normalizedAddress = "0x0000000000000000000000000000000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    dbMock = createDbMock();
    mocks.cobuildPrimaryDb.mockReturnValue(dbMock.db);
    mocks.normalizeAddress.mockImplementation((value: string) =>
      typeof value === "string" && value.toLowerCase().startsWith("0x")
        ? value.toLowerCase()
        : null
    );
    mocks.createAuthCode.mockReturnValue("auth-code");
    mocks.createRefreshToken.mockReturnValue("rfr_next");
    mocks.digestOAuthSecret.mockImplementation((value: string) => `digest:${value}`);
  });

  it("creates authorization codes with hashed secret and trimmed label", async () => {
    const result = await createAuthorizationCode({
      ownerAddress: normalizedAddress,
      agentKey: "default",
      scope: "tools:read offline_access",
      redirectUri: "http://127.0.0.1:43111/auth/callback",
      codeChallenge: "challenge-1",
      codeChallengeMethod: "S256",
      label: "  Laptop  ",
    });

    expect(result.code).toBe("auth-code");
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(dbMock.insert).toHaveBeenCalledOnce();
    expect(dbMock.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        codeHash: "digest:auth-code",
        ownerAddress: normalizedAddress,
        label: "Laptop",
      })
    );
  });

  it("throws when owner address cannot be normalized", async () => {
    mocks.normalizeAddress.mockReturnValueOnce(null);
    await expect(
      createAuthorizationCode({
        ownerAddress: "not-an-address",
        agentKey: "default",
        scope: "tools:read offline_access",
        redirectUri: "http://127.0.0.1:43111/auth/callback",
        codeChallenge: "challenge-1",
        codeChallengeMethod: "S256",
      })
    ).rejects.toThrow("Invalid owner address");
  });

  it("consumes authorization code with redirect + PKCE constraints", async () => {
    dbMock.updateReturning.mockResolvedValueOnce([
      {
        id: 9n,
        ownerAddress: normalizedAddress,
        agentKey: "default",
        scope: "tools:read offline_access",
        redirectUri: "http://127.0.0.1:43111/auth/callback",
        codeChallenge: "challenge-1",
        codeChallengeMethod: "S256",
        label: "Laptop",
      },
    ]);

    const consumed = await consumeAuthorizationCodeWithPkce({
      rawCode: "auth-code",
      redirectUri: "http://127.0.0.1:43111/auth/callback",
      expectedCodeChallenge: "challenge-1",
      codeChallengeMethod: "S256",
    });

    expect(consumed).toEqual({
      id: "9",
      ownerAddress: normalizedAddress,
      agentKey: "default",
      scope: "tools:read offline_access",
      redirectUri: "http://127.0.0.1:43111/auth/callback",
      codeChallenge: "challenge-1",
      codeChallengeMethod: "S256",
      label: "Laptop",
    });
  });

  it("returns null when code cannot be consumed", async () => {
    dbMock.updateReturning.mockResolvedValueOnce([]);
    await expect(
      consumeAuthorizationCodeWithPkce({
        rawCode: "missing",
        redirectUri: "http://127.0.0.1:43111/auth/callback",
        expectedCodeChallenge: "challenge-1",
        codeChallengeMethod: "S256",
      })
    ).resolves.toBeNull();
  });

  it("creates cli sessions and returns generated refresh token", async () => {
    dbMock.insertReturning.mockResolvedValueOnce([{ id: 22n }]);
    mocks.createRefreshToken.mockReturnValueOnce("rfr_created");

    const created = await createCliSession({
      ownerAddress: normalizedAddress,
      agentKey: "default",
      scope: "tools:read offline_access",
      label: "  Desktop  ",
    });

    expect(created).toEqual(
      expect.objectContaining({
        sessionId: "22",
        refreshToken: "rfr_created",
      })
    );
    expect(dbMock.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerAddress: normalizedAddress,
        refreshTokenHash: "digest:rfr_created",
        label: "Desktop",
      })
    );
  });

  it("throws when session insert does not return an id", async () => {
    dbMock.insertReturning.mockResolvedValueOnce([]);
    await expect(
      createCliSession({
        ownerAddress: normalizedAddress,
        agentKey: "default",
        scope: "tools:read offline_access",
      })
    ).rejects.toThrow("Failed to create cli session");
  });

  it("rotates refresh tokens and returns updated session", async () => {
    dbMock.updateReturning.mockResolvedValueOnce([
      {
        id: 33n,
        ownerAddress: normalizedAddress,
        agentKey: "default",
        scope: "tools:read offline_access",
        expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    ]);
    mocks.createRefreshToken.mockReturnValueOnce("rfr_rotated");

    const rotated = await rotateCliSessionByRefreshToken("rfr_old");
    expect(rotated).toEqual({
      sessionId: "33",
      ownerAddress: normalizedAddress,
      agentKey: "default",
      scope: "tools:read offline_access",
      refreshToken: "rfr_rotated",
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
    });
  });

  it("returns null when refresh token rotation misses session", async () => {
    dbMock.updateReturning.mockResolvedValueOnce([]);
    await expect(rotateCliSessionByRefreshToken("rfr_missing")).resolves.toBeNull();
  });

  it("lists active sessions with serialized timestamps", async () => {
    const createdAt = new Date("2026-03-03T00:00:00.000Z");
    const expiresAt = new Date("2026-05-03T00:00:00.000Z");
    dbMock.selectOrderBy.mockResolvedValueOnce([
      {
        id: 1n,
        agentKey: "default",
        scope: "tools:read offline_access",
        label: "Laptop",
        createdAt,
        lastUsedAt: null,
        expiresAt,
      },
    ]);

    const sessions = await listCliSessions(normalizedAddress);
    expect(sessions).toEqual([
      {
        id: "1",
        agentKey: "default",
        scope: "tools:read offline_access",
        label: "Laptop",
        createdAt: createdAt.toISOString(),
        lastUsedAt: null,
        expiresAt: expiresAt.toISOString(),
      },
    ]);
  });

  it("revokes sessions by owner + session id", async () => {
    dbMock.updateReturning.mockResolvedValueOnce([{ id: 2n }]);
    await expect(
      revokeCliSession({
        ownerAddress: normalizedAddress,
        sessionId: "2",
      })
    ).resolves.toBe(true);
  });

  it("returns false when session id is invalid or update affects no rows", async () => {
    await expect(
      revokeCliSession({
        ownerAddress: normalizedAddress,
        sessionId: "not-bigint",
      })
    ).resolves.toBe(false);

    dbMock.updateReturning.mockResolvedValueOnce([]);
    await expect(
      revokeCliSession({
        ownerAddress: normalizedAddress,
        sessionId: "3",
      })
    ).resolves.toBe(false);
  });
});
