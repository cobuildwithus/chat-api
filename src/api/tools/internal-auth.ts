import { requestContext } from "@fastify/request-context";
import { parseBearerToken } from "@cobuild/wire";
import type { FastifyReply, FastifyRequest } from "fastify";
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
      hasToolsRead: boolean;
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
  if (!principal.hasToolsRead) {
    return reply.status(403).send({ error: "tools:read scope required." });
  }

  setRequestUserFromHeaders(principal.ownerAddress, request);
  requestContext.set("toolsPrincipal", principal);
}
