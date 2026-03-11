import { parseBearerToken } from "@cobuild/wire";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getPublicError, toPublicErrorBody } from "../../public-errors";
import {
  setChatUserPrincipalFromRequest,
  setToolsPrincipal,
} from "../auth/principals";
import { parseToolsAuthHeaders } from "./schema";
import { authenticateToolsBearerToken } from "./token-auth";

async function authenticateBearerPrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<Awaited<ReturnType<typeof authenticateToolsBearerToken>> | null> {
  let authorization: string | undefined;
  try {
    authorization = parseToolsAuthHeaders(request.headers).authorization;
  } catch {
    authorization =
      typeof request.headers.authorization === "string"
        ? request.headers.authorization
        : undefined;
  }
  const rawToken = parseBearerToken(authorization);
  if (!rawToken) {
    const error = getPublicError("toolsUnauthorized");
    reply.status(error.statusCode).send(toPublicErrorBody("toolsUnauthorized"));
    return null;
  }

  const principal = await authenticateToolsBearerToken(rawToken);
  if (!principal) {
    const error = getPublicError("toolsUnauthorized");
    reply.status(error.statusCode).send(toPublicErrorBody("toolsUnauthorized"));
    return null;
  }

  return principal;
}

function setAuthenticatedToolsContext(
  principal: Awaited<ReturnType<typeof authenticateToolsBearerToken>>,
  request: FastifyRequest,
) {
  if (!principal) {
    return;
  }

  setChatUserPrincipalFromRequest(principal.ownerAddress, request);
  setToolsPrincipal(principal);
}

export async function enforceToolsBearerAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const principal = await authenticateBearerPrincipal(request, reply);
  if (!principal) {
    return;
  }

  if (!principal.hasToolsRead) {
    const error = getPublicError("toolsReadScopeRequired");
    return reply.status(error.statusCode).send(toPublicErrorBody("toolsReadScopeRequired"));
  }

  setAuthenticatedToolsContext(principal, request);
}

export async function enforceWalletExecuteBearerAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const principal = await authenticateBearerPrincipal(request, reply);
  if (!principal) {
    return;
  }

  if (!principal.hasWalletExecute) {
    const error = getPublicError("walletExecuteScopeRequired");
    return reply
      .status(error.statusCode)
      .send(toPublicErrorBody("walletExecuteScopeRequired"));
  }

  setAuthenticatedToolsContext(principal, request);
}
