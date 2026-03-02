import type { FastifyReply, FastifyRequest } from "fastify";
import { authenticateToolsBearerToken } from "./token-auth";

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
}
