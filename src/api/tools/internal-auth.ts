import { parseBearerToken } from "@cobuild/wire";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  getPublicError,
  toPublicErrorBody,
  type PublicErrorKey,
} from "../../public-errors";
import {
  setChatUserPrincipalFromRequest,
  setToolsPrincipal,
} from "../auth/principals";
import { parseToolsAuthHeaders } from "./schema";
import { authenticateToolsBearerToken } from "./token-auth";

type AuthenticatedToolsPrincipal = NonNullable<
  Awaited<ReturnType<typeof authenticateToolsBearerToken>>
>;

type BearerScopeRequirement = {
  capability: "hasToolsRead" | "hasWalletExecute";
  errorKey: Extract<PublicErrorKey, "toolsReadScopeRequired" | "walletExecuteScopeRequired">;
};

function replyWithPublicError(reply: FastifyReply, errorKey: PublicErrorKey) {
  const error = getPublicError(errorKey);
  reply.status(error.statusCode).send(toPublicErrorBody(errorKey));
}

async function authenticateBearerPrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthenticatedToolsPrincipal | null> {
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
    replyWithPublicError(reply, "toolsUnauthorized");
    return null;
  }

  const principal = await authenticateToolsBearerToken(rawToken);
  if (!principal) {
    replyWithPublicError(reply, "toolsUnauthorized");
    return null;
  }

  return principal;
}

function setAuthenticatedToolsContext(
  principal: AuthenticatedToolsPrincipal,
  request: FastifyRequest,
) {
  setChatUserPrincipalFromRequest(principal.ownerAddress, request);
  setToolsPrincipal(principal);
}

async function enforceBearerAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  requirement: BearerScopeRequirement,
) {
  const principal = await authenticateBearerPrincipal(request, reply);
  if (!principal) {
    return;
  }

  if (!principal[requirement.capability]) {
    replyWithPublicError(reply, requirement.errorKey);
    return;
  }

  setAuthenticatedToolsContext(principal, request);
}

export async function enforceToolsBearerAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  return enforceBearerAuth(request, reply, {
    capability: "hasToolsRead",
    errorKey: "toolsReadScopeRequired",
  });
}

export async function enforceWalletExecuteBearerAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  return enforceBearerAuth(request, reply, {
    capability: "hasWalletExecute",
    errorKey: "walletExecuteScopeRequired",
  });
}
