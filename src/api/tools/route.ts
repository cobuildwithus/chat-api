import type { FastifyReply, FastifyRequest } from "fastify";
import { executeTool, listToolMetadata, resolveToolMetadata } from "./registry";

type ToolExecutionBody = {
  name: string;
  input?: Record<string, unknown>;
};

type ToolMetadataParams = {
  name: string;
};

export async function handleToolsListRequest(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  return reply.send({
    tools: listToolMetadata(),
  });
}

export async function handleToolMetadataRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const params = request.params as ToolMetadataParams;
  const name = params.name.trim();
  const metadata = resolveToolMetadata(name);
  if (!metadata) {
    return reply.status(404).send({
      error: `Unknown tool "${name}".`,
    });
  }

  return reply.send({
    tool: metadata,
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
