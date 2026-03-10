import type { FastifyReply, FastifyRequest } from "fastify";
import {
  serializeCliToolExecutionErrorResponse,
  serializeCliToolExecutionSuccessResponse,
  serializeCliToolMetadataResponse,
  serializeCliToolsListResponse,
} from "@cobuild/wire";
import { getPublicError, toPublicErrorBody } from "../../public-errors";
import {
  executeTool,
  listToolMetadata,
  resolveToolMetadata,
} from "../../tools/registry";
import {
  parseToolExecutionBody,
  parseToolMetadataParams,
} from "./schema";

export async function handleToolsListRequest(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  return reply.send(serializeCliToolsListResponse({
    tools: listToolMetadata(),
  }));
}

export async function handleToolMetadataRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { name: rawName } = parseToolMetadataParams(request.params);
  const name = rawName.trim();
  const metadata = resolveToolMetadata(name);
  if (!metadata) {
    const error = getPublicError("toolUnknown", { toolName: name });
    return reply.status(error.statusCode).send(toPublicErrorBody("toolUnknown", { toolName: name }));
  }

  return reply.send(serializeCliToolMetadataResponse({
    tool: metadata,
  }));
}

export async function handleToolExecutionRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { name, input } = parseToolExecutionBody(request.body);
  const result = await executeTool(name, input);

  if (!result.ok) {
    return reply.status(result.statusCode).send(serializeCliToolExecutionErrorResponse({
      ok: false,
      name: result.name,
      statusCode: result.statusCode,
      error: result.error,
    }));
  }

  if (result.cacheControl) {
    reply.header("Cache-Control", result.cacheControl);
  }

  return reply.send(serializeCliToolExecutionSuccessResponse({
    ok: true,
    name: result.name,
    output: result.output,
  }));
}
