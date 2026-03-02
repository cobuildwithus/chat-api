import { requestContext } from "@fastify/request-context";
import type { FastifyReply, FastifyRequest } from "fastify";
import { authenticateToolsBearerToken } from "./token-auth";

declare module "@fastify/request-context" {
  interface RequestContextData {
    toolsPrincipal?: {
      tokenId: string;
      ownerAddress: `0x${string}`;
      agentKey: string;
      canWrite: boolean;
    };
  }
}

function parseBearerToken(headerValue: unknown): string | null {
  if (typeof headerValue !== "string") return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim();
  return token && token.length > 0 ? token : null;
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

  requestContext.set("user", {
    address: principal.ownerAddress,
    city: request.headers["city"]?.toString() ?? null,
    country: request.headers["country"]?.toString() ?? null,
    countryRegion: request.headers["country-region"]?.toString() ?? null,
    userAgent: request.headers["user-agent"]?.toString() ?? null,
  });
  requestContext.set("toolsPrincipal", principal);
}
