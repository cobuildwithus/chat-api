import type { FastifyReply, FastifyRequest } from "fastify";
import { getCobuildAiContextSnapshot } from "../../infra/cobuild-ai-context";

const CACHE_CONTROL_HEADER = "public, max-age=900, stale-while-revalidate=300";

export async function handleCobuildAiContextRequest(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  const snapshot = await getCobuildAiContextSnapshot();
  if (!snapshot.data) {
    return reply.status(502).send({
      error: `Cobuild AI context unavailable: ${snapshot.error ?? "unknown error"}.`,
    });
  }

  reply.header("Cache-Control", CACHE_CONTROL_HEADER);
  return reply.send(snapshot.data);
}
