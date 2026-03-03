import type { FastifyReply, FastifyRequest } from "fastify";
import { getChatUserOrThrow } from "../auth/validate-chat-user";
import { signCliAccessToken } from "./jwt";
import {
  canWriteFromScope,
  validateScope,
} from "./scopes";
import {
  OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  OAUTH_PUBLIC_CLIENT_ID,
  deriveS256CodeChallenge,
  validateCliRedirectUri,
  validatePkceCodeChallenge,
  validatePkceCodeVerifier,
} from "./security";
import {
  consumeAuthorizationCodeWithPkce,
  createAuthorizationCode,
  createCliSession,
  listCliSessions,
  revokeCliSession,
  rotateCliSessionByRefreshToken,
} from "./store";

type OauthAuthorizeCodeBody = {
  client_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: string;
  state: string;
  agent_key: string;
  label?: string;
};

type OauthTokenBody = {
  grant_type: string;
  client_id: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  refresh_token?: string;
};

type SessionRevokeBody = {
  sessionId: string;
};

function sendOauthError(
  reply: FastifyReply,
  statusCode: number,
  error: string,
  description: string,
) {
  return reply.status(statusCode).send({
    error,
    error_description: description,
  });
}

function assertPublicClient(clientId: string): void {
  if (clientId !== OAUTH_PUBLIC_CLIENT_ID) {
    throw new Error("Unsupported client_id");
  }
}

function parseState(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("state is required");
  }
  return trimmed;
}

export async function handleOauthAuthorizeCodeRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const user = getChatUserOrThrow();
    const body = request.body as OauthAuthorizeCodeBody;
    assertPublicClient(body.client_id);
    const redirectUri = validateCliRedirectUri(body.redirect_uri);
    const scope = validateScope(body.scope);
    const codeChallenge = validatePkceCodeChallenge(body.code_challenge);
    if (body.code_challenge_method !== "S256") {
      throw new Error("code_challenge_method must be S256");
    }
    const state = parseState(body.state);
    const agentKey = body.agent_key.trim();
    if (!agentKey) {
      throw new Error("agent_key is required");
    }

    const created = await createAuthorizationCode({
      ownerAddress: user.address,
      agentKey,
      scope,
      redirectUri,
      codeChallenge,
      codeChallengeMethod: "S256",
      label: body.label,
    });

    return reply.send({
      code: created.code,
      state,
      redirect_uri: redirectUri,
      expires_in: Math.floor((created.expiresAt.getTime() - Date.now()) / 1000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid authorization request";
    return sendOauthError(reply, 400, "invalid_request", message);
  }
}

function tokenResponse(params: {
  accessToken: string;
  refreshToken: string;
  scope: string;
  sessionId: string;
}) {
  return {
    token_type: "Bearer",
    access_token: params.accessToken,
    expires_in: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: params.refreshToken,
    scope: params.scope,
    session_id: params.sessionId,
    can_write: canWriteFromScope(params.scope),
  };
}

export async function handleOauthTokenRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = request.body as OauthTokenBody;
  try {
    assertPublicClient(body.client_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unsupported client_id";
    return sendOauthError(reply, 401, "invalid_client", message);
  }

  if (body.grant_type === "authorization_code") {
    try {
      if (!body.code || !body.redirect_uri || !body.code_verifier) {
        throw new Error("code, redirect_uri, and code_verifier are required");
      }

      const redirectUri = validateCliRedirectUri(body.redirect_uri);
      const codeVerifier = validatePkceCodeVerifier(body.code_verifier);
      const expectedCodeChallenge = deriveS256CodeChallenge(codeVerifier);
      const consumedCode = await consumeAuthorizationCodeWithPkce({
        rawCode: body.code,
        redirectUri,
        expectedCodeChallenge,
        codeChallengeMethod: "S256",
      });
      if (!consumedCode) {
        return sendOauthError(reply, 400, "invalid_grant", "Authorization code is invalid or expired");
      }

      const session = await createCliSession({
        ownerAddress: consumedCode.ownerAddress,
        agentKey: consumedCode.agentKey,
        scope: consumedCode.scope,
        label: consumedCode.label,
      });
      const accessToken = await signCliAccessToken({
        sub: consumedCode.ownerAddress,
        sid: session.sessionId,
        agentKey: consumedCode.agentKey,
        scope: consumedCode.scope,
      });

      return reply.send(
        tokenResponse({
          accessToken,
          refreshToken: session.refreshToken,
          scope: consumedCode.scope,
          sessionId: session.sessionId,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid token request";
      return sendOauthError(reply, 400, "invalid_request", message);
    }
  }

  if (body.grant_type === "refresh_token") {
    try {
      if (!body.refresh_token) {
        throw new Error("refresh_token is required");
      }

      const rotated = await rotateCliSessionByRefreshToken(body.refresh_token);
      if (!rotated) {
        return sendOauthError(reply, 400, "invalid_grant", "Refresh token is invalid or expired");
      }
      const accessToken = await signCliAccessToken({
        sub: rotated.ownerAddress,
        sid: rotated.sessionId,
        agentKey: rotated.agentKey,
        scope: rotated.scope,
      });

      return reply.send(
        tokenResponse({
          accessToken,
          refreshToken: rotated.refreshToken,
          scope: rotated.scope,
          sessionId: rotated.sessionId,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid token request";
      return sendOauthError(reply, 400, "invalid_request", message);
    }
  }

  return sendOauthError(reply, 400, "unsupported_grant_type", "Unsupported grant_type");
}

export async function handleCliSessionsListRequest(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = getChatUserOrThrow();
  const sessions = await listCliSessions(user.address);
  return reply.send({
    ok: true,
    sessions,
  });
}

export async function handleCliSessionRevokeRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = getChatUserOrThrow();
  const body = request.body as SessionRevokeBody;
  const revoked = await revokeCliSession({
    ownerAddress: user.address,
    sessionId: body.sessionId,
  });
  return reply.send({
    ok: true,
    revoked,
  });
}
