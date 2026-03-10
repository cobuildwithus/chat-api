import type { FastifyReply, FastifyRequest } from "fastify";
import {
  serializeCliOAuthAuthorizeCodeResponse,
  serializeCliOAuthErrorResponse,
  serializeCliOAuthTokenResponse,
} from "@cobuild/wire";
import { getChatUserOrThrow } from "../auth/validate-chat-user";
import {
  parseCliSessionRevokeBody,
  parseOauthAuthorizeCodeBody,
  parseOauthTokenBody,
} from "./schema";
import { signCliAccessToken } from "./jwt";
import {
  CLI_OAUTH_PUBLIC_CLIENT_ID,
  OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  deriveS256CodeChallenge,
} from "./security";
import {
  createAuthorizationCode,
  exchangeAuthorizationCodeForSession,
  listCliSessions,
  revokeCliSession,
  rotateCliSessionAndIssueAccessToken,
} from "./store";

function setOauthNoStoreHeaders(reply: FastifyReply): void {
  reply.header("Cache-Control", "no-store");
  reply.header("Pragma", "no-cache");
}

function sendOauthError(
  reply: FastifyReply,
  statusCode: number,
  error: string,
  description: string,
) {
  setOauthNoStoreHeaders(reply);
  return reply.status(statusCode).send(
    serializeCliOAuthErrorResponse({
      error,
      errorDescription: description,
    }),
  );
}

function assertPublicClient(clientId: string): void {
  if (clientId !== CLI_OAUTH_PUBLIC_CLIENT_ID) {
    throw new Error("Unsupported client_id");
  }
}

function getOauthErrorDescription(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function toOauthTokenResponse(args: {
  accessToken: string;
  refreshToken: string;
  scope: string;
  sessionId: string;
}) {
  return serializeCliOAuthTokenResponse({
    accessToken: args.accessToken,
    expiresIn: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: args.refreshToken,
    scope: args.scope,
    sessionId: args.sessionId,
  });
}

export async function handleOauthAuthorizeCodeRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const user = getChatUserOrThrow();
    const body = parseOauthAuthorizeCodeBody(request.body);
    assertPublicClient(body.clientId);

    const created = await createAuthorizationCode({
      ownerAddress: user.address,
      agentKey: body.agentKey,
      scope: body.scope,
      redirectUri: body.redirectUri,
      codeChallenge: body.codeChallenge,
      codeChallengeMethod: body.codeChallengeMethod,
      ...(body.label ? { label: body.label } : {}),
    });

    setOauthNoStoreHeaders(reply);
    return reply.send(
      serializeCliOAuthAuthorizeCodeResponse({
        code: created.code,
        state: body.state,
        redirectUri: body.redirectUri,
        expiresIn: Math.floor((created.expiresAt.getTime() - Date.now()) / 1000),
      }),
    );
  } catch (error) {
    return sendOauthError(
      reply,
      400,
      "invalid_request",
      getOauthErrorDescription(error, "Invalid authorization request"),
    );
  }
}

export async function handleOauthTokenRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  let body: ReturnType<typeof parseOauthTokenBody>;
  try {
    body = parseOauthTokenBody(request.body);
  } catch (error) {
    return sendOauthError(
      reply,
      400,
      "invalid_request",
      getOauthErrorDescription(error, "Invalid token request"),
    );
  }

  try {
    assertPublicClient(body.clientId);
  } catch (error) {
    return sendOauthError(
      reply,
      401,
      "invalid_client",
      getOauthErrorDescription(error, "Unsupported client_id"),
    );
  }

  if (body.grantType === "authorization_code") {
    try {
      if (!body.code || !body.redirectUri || !body.codeVerifier) {
        throw new Error("code, redirect_uri, and code_verifier are required");
      }

      const expectedCodeChallenge = await deriveS256CodeChallenge(body.codeVerifier);
      const exchanged = await exchangeAuthorizationCodeForSession({
        rawCode: body.code,
        redirectUri: body.redirectUri,
        expectedCodeChallenge,
        codeChallengeMethod: "S256",
      });
      if (!exchanged) {
        return sendOauthError(reply, 400, "invalid_grant", "Authorization code is invalid or expired");
      }

      const accessToken = await signCliAccessToken({
        sub: exchanged.ownerAddress,
        sid: exchanged.sessionId,
        agentKey: exchanged.agentKey,
        scope: exchanged.scope,
      });

      setOauthNoStoreHeaders(reply);
      return reply.send(toOauthTokenResponse({
        accessToken,
        refreshToken: exchanged.refreshToken,
        scope: exchanged.scope,
        sessionId: exchanged.sessionId,
      }));
    } catch (error) {
      return sendOauthError(
        reply,
        400,
        "invalid_request",
        getOauthErrorDescription(error, "Invalid token request"),
      );
    }
  }

  if (body.grantType === "refresh_token") {
    try {
      if (!body.refreshToken) {
        throw new Error("refresh_token is required");
      }

      const rotated = await rotateCliSessionAndIssueAccessToken({
        refreshToken: body.refreshToken,
        issueAccessToken: async (claims) =>
          await signCliAccessToken({
            sub: claims.ownerAddress,
            sid: claims.sessionId,
            agentKey: claims.agentKey,
            scope: claims.scope,
          }),
      });
      if (!rotated) {
        return sendOauthError(reply, 400, "invalid_grant", "Refresh token is invalid or expired");
      }

      setOauthNoStoreHeaders(reply);
      return reply.send(toOauthTokenResponse({
        accessToken: rotated.accessToken,
        refreshToken: rotated.refreshToken,
        scope: rotated.scope,
        sessionId: rotated.sessionId,
      }));
    } catch (error) {
      return sendOauthError(
        reply,
        400,
        "invalid_request",
        getOauthErrorDescription(error, "Invalid token request"),
      );
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
  setOauthNoStoreHeaders(reply);
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
  const body = parseCliSessionRevokeBody(request.body);
  const revoked = await revokeCliSession({
    ownerAddress: user.address,
    sessionId: body.sessionId,
  });
  setOauthNoStoreHeaders(reply);
  return reply.send({
    ok: true,
    revoked,
  });
}
