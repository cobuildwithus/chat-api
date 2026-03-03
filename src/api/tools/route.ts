import type { FastifyReply, FastifyRequest } from "fastify";
import { requestContext } from "@fastify/request-context";
import {
  executeTool,
  listToolMetadata,
  requiresWriteScopeForTool,
  resolveToolMetadata,
} from "../../tools/registry";

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
  const toolsPrincipal = requestContext.get("toolsPrincipal");
  const requiresWriteScope = requiresWriteScopeForTool(body.name);
  const hasToolsWriteScope = toolsPrincipal?.hasToolsWrite === true;
  const hasWalletExecuteScope = toolsPrincipal?.hasWalletExecute === true;
  if (requiresWriteScope && !hasToolsWriteScope) {
    return reply.status(403).send({
      ok: false,
      name: body.name,
      statusCode: 403,
      error: "This token does not have tools:write scope for the requested tool.",
    });
  }
  if (requiresWriteScope && !hasWalletExecuteScope) {
    return reply.status(403).send({
      ok: false,
      name: body.name,
      statusCode: 403,
      error: "This token does not have wallet:execute scope for the requested tool.",
    });
  }

  const result = await executeTool(body.name, body.input ?? {});

  if (!result.ok) {
    return reply.status(result.statusCode).send({
      ok: false,
      name: result.name,
      statusCode: result.statusCode,
      error: result.error,
    });
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
