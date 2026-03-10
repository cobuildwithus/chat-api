import { parseBearerToken } from "@cobuild/wire";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getPublicError, toPublicErrorBody } from "../../public-errors";
import {
  setChatUserPrincipalFromRequest,
  setToolsPrincipal,
} from "../auth/principals";
import { parseToolsAuthHeaders } from "./schema";
import { authenticateToolsBearerToken } from "./token-auth";

export async function enforceToolsBearerAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
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
    return reply.status(error.statusCode).send(toPublicErrorBody("toolsUnauthorized"));
  }

  const principal = await authenticateToolsBearerToken(rawToken);
  if (!principal) {
    const error = getPublicError("toolsUnauthorized");
    return reply.status(error.statusCode).send(toPublicErrorBody("toolsUnauthorized"));
  }
  if (!principal.hasToolsRead) {
    const error = getPublicError("toolsReadScopeRequired");
    return reply.status(error.statusCode).send(toPublicErrorBody("toolsReadScopeRequired"));
  }

  setChatUserPrincipalFromRequest(principal.ownerAddress, request);
  setToolsPrincipal(principal);
}
