import type { FastifyReply, FastifyRequest } from "fastify";
import { getCobuildAiContextSnapshot } from "../../infra/cobuild-ai-context";
import { getPublicError, toPublicErrorBody } from "../../public-errors";

const CACHE_CONTROL_HEADER = "public, max-age=900, stale-while-revalidate=300";

export async function handleCobuildAiContextRequest(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const snapshot = await getCobuildAiContextSnapshot();
    if (!snapshot.data) {
      const error = getPublicError("contextUnavailable");
      reply.header("Cache-Control", "no-store");
      return reply.status(error.statusCode).send(toPublicErrorBody("contextUnavailable"));
    }

    reply.header("Cache-Control", CACHE_CONTROL_HEADER);
    return reply.send(snapshot.data);
  } catch (error) {
    console.error("Cobuild AI context route error", error);
    const publicError = getPublicError("contextUnavailable");
    reply.header("Cache-Control", "no-store");
    return reply.status(publicError.statusCode).send(toPublicErrorBody("contextUnavailable"));
  }
}
