import type { FastifyReply, FastifyRequest } from "fastify";
import { executeTool, listToolMetadata } from "./registry";

type ToolExecutionBody = {
  name: string;
  input?: Record<string, unknown>;
};

export async function handleToolsListRequest(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  return reply.send({
    tools: listToolMetadata(),
  });
}

export async function handleToolExecutionRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = request.body as ToolExecutionBody;
  const result = await executeTool(body.name, body.input ?? {});

  if (!result.ok) {
    return reply.status(result.statusCode).send({ error: result.error });
  }

  if (result.cacheControl) {
    reply.header("Cache-Control", result.cacheControl);
  }

  return reply.send({
    ok: true,
    name: result.name,
    output: result.output,
  });
}
