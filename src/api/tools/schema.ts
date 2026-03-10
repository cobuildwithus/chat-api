import type { FastifySchema } from "fastify";
import {
  cliToolExecutionRequestBodyJsonSchema,
  cliToolMetadataParamsJsonSchema,
  cliToolsAuthHeadersJsonSchema,
  parseCliToolExecutionRequest,
  parseCliToolMetadataParams,
  parseCliToolsAuthHeaders,
  type CliToolExecutionRequest,
  type CliToolMetadataParams,
  type CliToolsAuthHeaders,
} from "@cobuild/wire";

export type ToolExecutionBody = CliToolExecutionRequest;

export type ToolMetadataParams = CliToolMetadataParams;

export type ToolsAuthHeaders = CliToolsAuthHeaders;

export const toolExecutionSchema = {
  body: cliToolExecutionRequestBodyJsonSchema,
  headers: cliToolsAuthHeadersJsonSchema,
} satisfies FastifySchema;

export const toolsListSchema = {
  headers: cliToolsAuthHeadersJsonSchema,
} satisfies FastifySchema;

export const toolMetadataSchema = {
  params: cliToolMetadataParamsJsonSchema,
  headers: cliToolsAuthHeadersJsonSchema,
} satisfies FastifySchema;

export function parseToolExecutionBody(input: unknown): ToolExecutionBody {
  return parseCliToolExecutionRequest(input);
}

export function parseToolMetadataParams(input: unknown): ToolMetadataParams {
  return parseCliToolMetadataParams(input);
}

export function parseToolsAuthHeaders(input: unknown): ToolsAuthHeaders {
  return parseCliToolsAuthHeaders(input);
}
