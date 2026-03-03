import { requestContext } from "@fastify/request-context";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseBearerToken } from "../auth/parse-bearer-token";
import { setRequestUserFromHeaders } from "../auth/set-request-user";
import { authenticateToolsBearerToken } from "./token-auth";

declare module "@fastify/request-context" {
  interface RequestContextData {
    toolsPrincipal?: {
      sessionId: string;
      ownerAddress: `0x${string}`;
      agentKey: string;
      scope: string;
      scopes: string[];
      hasToolsWrite: boolean;
      hasWalletExecute: boolean;
      hasAnyWriteScope: boolean;
    };
  }
}

export async function enforceToolsBearerAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const rawToken = parseBearerToken(request.headers.authorization);
  if (!rawToken) {
    return reply.status(401).send({ error: "Unauthorized." });
  }

  const principal = await authenticateToolsBearerToken(rawToken);
  if (!principal) {
    return reply.status(401).send({ error: "Unauthorized." });
  }

  setRequestUserFromHeaders(principal.ownerAddress, request);
  requestContext.set("toolsPrincipal", principal);
}
