import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveS256CodeChallenge } from "@cobuild/wire";
import {
  handleCliSessionRevokeRequest,
  handleCliSessionsListRequest,
  handleOauthAuthorizeCodeRequest,
  handleOauthTokenRequest,
} from "../../../src/api/oauth/route";
import { createReply } from "../../utils/fastify";

const mocks = vi.hoisted(() => ({
  getChatUserOrThrow: vi.fn(),
  createAuthorizationCode: vi.fn(),
  exchangeAuthorizationCodeForSession: vi.fn(),
  rotateCliSessionAndIssueAccessToken: vi.fn(),
  listCliSessions: vi.fn(),
  revokeCliSession: vi.fn(),
  signCliAccessToken: vi.fn(),
}));

vi.mock("../../../src/api/auth/validate-chat-user", () => ({
  getChatUserOrThrow: (...args: unknown[]) => mocks.getChatUserOrThrow(...args),
}));

vi.mock("../../../src/api/oauth/store", () => ({
  createAuthorizationCode: (...args: unknown[]) => mocks.createAuthorizationCode(...args),
  exchangeAuthorizationCodeForSession: (...args: unknown[]) =>
    mocks.exchangeAuthorizationCodeForSession(...args),
  rotateCliSessionAndIssueAccessToken: (...args: unknown[]) =>
    mocks.rotateCliSessionAndIssueAccessToken(...args),
  listCliSessions: (...args: unknown[]) => mocks.listCliSessions(...args),
  revokeCliSession: (...args: unknown[]) => mocks.revokeCliSession(...args),
}));

vi.mock("../../../src/api/oauth/jwt", () => ({
  signCliAccessToken: (...args: unknown[]) => mocks.signCliAccessToken(...args),
}));

describe("oauth route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates authorization codes for authenticated users", async () => {
    mocks.getChatUserOrThrow.mockReturnValueOnce({
      address: "0x0000000000000000000000000000000000000001",
    });
    mocks.createAuthorizationCode.mockResolvedValueOnce({
      code: "auth-code",
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });

    const reply = createReply();
    await handleOauthAuthorizeCodeRequest(
      {
        body: {
          client_id: "buildbot_cli",
          redirect_uri: "http://127.0.0.1:4545/auth/callback",
          scope: "tools:read tools:write wallet:read wallet:execute offline_access",
          code_challenge: "1".repeat(43),
          code_challenge_method: "S256",
          state: "state-12345678",
          agent_key: "default",
        },
      } as FastifyRequest,
      reply,
    );

    expect(mocks.createAuthorizationCode).toHaveBeenCalled();
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "auth-code",
        state: "state-12345678",
        redirect_uri: "http://127.0.0.1:4545/auth/callback",
      }),
    );
  });

  it("exchanges authorization codes for JWT access + refresh tokens", async () => {
    mocks.exchangeAuthorizationCodeForSession.mockResolvedValueOnce({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
      scope: "tools:read tools:write wallet:read wallet:execute offline_access",
      label: "local",
      sessionId: "22",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 1_000),
    });
    mocks.signCliAccessToken.mockResolvedValueOnce("jwt-access");

    const reply = createReply();
    await handleOauthTokenRequest(
      {
        body: {
          grant_type: "authorization_code",
          client_id: "buildbot_cli",
          code: "code",
          redirect_uri: "http://127.0.0.1:4545/auth/callback",
          code_verifier: "A".repeat(43),
        },
      } as FastifyRequest,
      reply,
    );

    const expectedCodeChallenge = await deriveS256CodeChallenge("A".repeat(43));
    expect(mocks.exchangeAuthorizationCodeForSession).toHaveBeenCalledWith({
      rawCode: "code",
      redirectUri: "http://127.0.0.1:4545/auth/callback",
      expectedCodeChallenge,
      codeChallengeMethod: "S256",
    });
    expect(mocks.signCliAccessToken).toHaveBeenCalledWith({
      sub: "0x0000000000000000000000000000000000000001",
      sid: "22",
      agentKey: "default",
      scope: "tools:read tools:write wallet:read wallet:execute offline_access",
    });
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        token_type: "Bearer",
        access_token: "jwt-access",
        refresh_token: "refresh",
        session_id: "22",
      }),
    );
  });

  it("refreshes sessions by rotating refresh token", async () => {
    mocks.rotateCliSessionAndIssueAccessToken.mockResolvedValueOnce({
      sessionId: "33",
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
      scope: "tools:read wallet:read offline_access",
      refreshToken: "refresh-next",
      expiresAt: new Date(Date.now() + 10_000),
      accessToken: "jwt-access-next",
    });

    const reply = createReply();
    await handleOauthTokenRequest(
      {
        body: {
          grant_type: "refresh_token",
          client_id: "buildbot_cli",
          refresh_token: "refresh-old",
        },
      } as FastifyRequest,
      reply,
    );

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: "jwt-access-next",
        refresh_token: "refresh-next",
        session_id: "33",
      }),
    );
    expect(mocks.rotateCliSessionAndIssueAccessToken).toHaveBeenCalledWith({
      refreshToken: "refresh-old",
      issueAccessToken: expect.any(Function),
    });
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("returns invalid_grant when code + redirect_uri + PKCE tuple does not match", async () => {
    mocks.exchangeAuthorizationCodeForSession.mockResolvedValueOnce(null);

    const reply = createReply();
    await handleOauthTokenRequest(
      {
        body: {
          grant_type: "authorization_code",
          client_id: "buildbot_cli",
          code: "bad-code",
          redirect_uri: "http://127.0.0.1:4545/auth/callback",
          code_verifier: "A".repeat(43),
        },
      } as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "invalid_grant",
      error_description: "Authorization code is invalid or expired",
    });
    expect(mocks.exchangeAuthorizationCodeForSession).toHaveBeenCalledOnce();
    expect(mocks.signCliAccessToken).not.toHaveBeenCalled();
  });

  it("returns invalid_client when client_id is unsupported", async () => {
    const reply = createReply();
    await handleOauthTokenRequest(
      {
        body: {
          grant_type: "authorization_code",
          client_id: "other-client",
          code: "code",
          redirect_uri: "http://127.0.0.1:4545/auth/callback",
          code_verifier: "A".repeat(43),
        },
      } as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({
      error: "invalid_client",
      error_description: "Unsupported client_id",
    });
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("returns invalid_request when authorization_code grant fields are missing", async () => {
    const reply = createReply();
    await handleOauthTokenRequest(
      {
        body: {
          grant_type: "authorization_code",
          client_id: "buildbot_cli",
        },
      } as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "invalid_request",
      error_description: "code, redirect_uri, and code_verifier are required",
    });
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("returns invalid_request when refresh_token grant omits refresh token", async () => {
    const reply = createReply();
    await handleOauthTokenRequest(
      {
        body: {
          grant_type: "refresh_token",
          client_id: "buildbot_cli",
        },
      } as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "invalid_request",
      error_description: "refresh_token is required",
    });
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("returns invalid_grant when refresh token is invalid or expired", async () => {
    mocks.rotateCliSessionAndIssueAccessToken.mockResolvedValueOnce(null);

    const reply = createReply();
    await handleOauthTokenRequest(
      {
        body: {
          grant_type: "refresh_token",
          client_id: "buildbot_cli",
          refresh_token: "rfr_missing",
        },
      } as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "invalid_grant",
      error_description: "Refresh token is invalid or expired",
    });
    expect(mocks.signCliAccessToken).not.toHaveBeenCalled();
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("returns unsupported_grant_type for unknown grant types", async () => {
    const reply = createReply();
    await handleOauthTokenRequest(
      {
        body: {
          grant_type: "client_credentials",
          client_id: "buildbot_cli",
        },
      } as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "unsupported_grant_type",
      error_description: "Unsupported grant_type",
    });
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("returns invalid_request for bad authorize-code payloads", async () => {
    mocks.getChatUserOrThrow.mockReturnValueOnce({
      address: "0x0000000000000000000000000000000000000001",
    });

    const reply = createReply();
    await handleOauthAuthorizeCodeRequest(
      {
        body: {
          client_id: "buildbot_cli",
          redirect_uri: "https://127.0.0.1:4545/auth/callback",
          scope: "tools:read wallet:read offline_access",
          code_challenge: "1".repeat(43),
          code_challenge_method: "S256",
          state: "state-12345678",
          agent_key: "default",
        },
      } as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "invalid_request",
      error_description: "redirect_uri must use http loopback transport",
    });
    expect(mocks.createAuthorizationCode).not.toHaveBeenCalled();
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("rejects authorize-code requests when state is blank", async () => {
    mocks.getChatUserOrThrow.mockReturnValueOnce({
      address: "0x0000000000000000000000000000000000000001",
    });

    const reply = createReply();
    await handleOauthAuthorizeCodeRequest(
      {
        body: {
          client_id: "buildbot_cli",
          redirect_uri: "http://127.0.0.1:4545/auth/callback",
          scope: "tools:read wallet:read offline_access",
          code_challenge: "1".repeat(43),
          code_challenge_method: "S256",
          state: "   ",
          agent_key: "default",
        },
      } as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "invalid_request",
      error_description: "state is required",
    });
    expect(mocks.createAuthorizationCode).not.toHaveBeenCalled();
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("rejects authorize-code requests when PKCE method is not S256", async () => {
    mocks.getChatUserOrThrow.mockReturnValueOnce({
      address: "0x0000000000000000000000000000000000000001",
    });

    const reply = createReply();
    await handleOauthAuthorizeCodeRequest(
      {
        body: {
          client_id: "buildbot_cli",
          redirect_uri: "http://127.0.0.1:4545/auth/callback",
          scope: "tools:read wallet:read offline_access",
          code_challenge: "1".repeat(43),
          code_challenge_method: "plain",
          state: "state-12345678",
          agent_key: "default",
        },
      } as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "invalid_request",
      error_description: "code_challenge_method must be S256",
    });
    expect(mocks.createAuthorizationCode).not.toHaveBeenCalled();
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("rejects authorize-code requests when agent_key is blank", async () => {
    mocks.getChatUserOrThrow.mockReturnValueOnce({
      address: "0x0000000000000000000000000000000000000001",
    });

    const reply = createReply();
    await handleOauthAuthorizeCodeRequest(
      {
        body: {
          client_id: "buildbot_cli",
          redirect_uri: "http://127.0.0.1:4545/auth/callback",
          scope: "tools:read wallet:read offline_access",
          code_challenge: "1".repeat(43),
          code_challenge_method: "S256",
          state: "state-12345678",
          agent_key: "  ",
        },
      } as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "invalid_request",
      error_description: "agent_key is required",
    });
    expect(mocks.createAuthorizationCode).not.toHaveBeenCalled();
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("rejects authorize-code requests when label contains unsupported characters", async () => {
    mocks.getChatUserOrThrow.mockReturnValueOnce({
      address: "0x0000000000000000000000000000000000000001",
    });

    const reply = createReply();
    await handleOauthAuthorizeCodeRequest(
      {
        body: {
          client_id: "buildbot_cli",
          redirect_uri: "http://127.0.0.1:4545/auth/callback",
          scope: "tools:read wallet:read offline_access",
          code_challenge: "1".repeat(43),
          code_challenge_method: "S256",
          state: "state-12345678",
          agent_key: "default",
          label: "<script>",
        },
      } as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "invalid_request",
      error_description: "label contains unsupported characters",
    });
    expect(mocks.createAuthorizationCode).not.toHaveBeenCalled();
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("lists active sessions for authenticated users", async () => {
    mocks.getChatUserOrThrow.mockReturnValueOnce({
      address: "0x0000000000000000000000000000000000000001",
    });
    mocks.listCliSessions.mockResolvedValueOnce([
      {
        id: "1",
        agentKey: "default",
        scope: "tools:read wallet:read offline_access",
        label: "Laptop",
        createdAt: "2026-03-03T00:00:00.000Z",
        lastUsedAt: null,
        expiresAt: "2026-05-03T00:00:00.000Z",
      },
    ]);

    const reply = createReply();
    await handleCliSessionsListRequest({} as FastifyRequest, reply);

    expect(reply.send).toHaveBeenCalledWith({
      ok: true,
      sessions: [
        {
          id: "1",
          agentKey: "default",
          scope: "tools:read wallet:read offline_access",
          label: "Laptop",
          createdAt: "2026-03-03T00:00:00.000Z",
          lastUsedAt: null,
          expiresAt: "2026-05-03T00:00:00.000Z",
        },
      ],
    });
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("revokes sessions owned by the authenticated user", async () => {
    mocks.getChatUserOrThrow.mockReturnValueOnce({
      address: "0x0000000000000000000000000000000000000001",
    });
    mocks.revokeCliSession.mockResolvedValueOnce(true);

    const reply = createReply();
    await handleCliSessionRevokeRequest(
      {
        body: {
          sessionId: "2",
        },
      } as FastifyRequest,
      reply,
    );

    expect(mocks.revokeCliSession).toHaveBeenCalledWith({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      sessionId: "2",
    });
    expect(reply.send).toHaveBeenCalledWith({
      ok: true,
      revoked: true,
    });
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("Pragma", "no-cache");
  });
});
