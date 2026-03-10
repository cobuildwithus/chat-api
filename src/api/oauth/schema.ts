import type { FastifySchema } from "fastify";
import {
  cliOAuthAuthorizeCodeRequestBodyJsonSchema,
  cliOAuthTokenRequestBodyJsonSchema,
  parseCliOAuthAuthorizeCodeRequestBody,
  parseCliOAuthTokenRequestBody,
  type CliOAuthAuthorizeCodeRequestBody,
  type CliOAuthTokenRequestBody,
} from "@cobuild/wire";
import { z } from "zod";
import { buildFastifyRouteSchema } from "../zod-route-schema";

const cliSessionRevokeBodySchema = z.object({
  sessionId: z.string().trim().min(1),
}).strict();

export type OauthAuthorizeCodeBody = CliOAuthAuthorizeCodeRequestBody;

export type OauthTokenBody = CliOAuthTokenRequestBody;

export type SessionRevokeBody = z.infer<typeof cliSessionRevokeBodySchema>;

export const oauthAuthorizeCodeSchema = {
  body: cliOAuthAuthorizeCodeRequestBodyJsonSchema,
} satisfies FastifySchema;

export const oauthTokenSchema = {
  body: cliOAuthTokenRequestBodyJsonSchema,
} satisfies FastifySchema;

export const cliSessionsListSchema = buildFastifyRouteSchema({});

export const cliSessionRevokeSchema = {
  body: z.toJSONSchema(cliSessionRevokeBodySchema, { target: "draft-7" }) as Record<string, unknown>,
} satisfies FastifySchema;

export function parseOauthAuthorizeCodeBody(input: unknown): OauthAuthorizeCodeBody {
  return parseCliOAuthAuthorizeCodeRequestBody(input);
}

export function parseOauthTokenBody(input: unknown): OauthTokenBody {
  return parseCliOAuthTokenRequestBody(input);
}

export function parseCliSessionRevokeBody(input: unknown): SessionRevokeBody {
  return cliSessionRevokeBodySchema.parse(input);
}
