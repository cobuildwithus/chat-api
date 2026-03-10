import type { FastifySchema } from "fastify";
import { z } from "zod";

type RouteSchemaPart = "body" | "querystring" | "params" | "headers";

export type RuntimeSchemaParser<TSchema extends z.ZodTypeAny> = {
  parse: (input: unknown) => z.infer<TSchema>;
  schema: Record<string, unknown>;
};

export function createRuntimeSchemaParser<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
): RuntimeSchemaParser<TSchema> {
  return {
    parse: (input) => schema.parse(input),
    schema: z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>,
  };
}

export function buildFastifyRouteSchema(
  parts: Partial<Record<RouteSchemaPart, RuntimeSchemaParser<z.ZodTypeAny>>>,
): FastifySchema {
  return Object.fromEntries(
    Object.entries(parts).map(([key, parser]) => [key, parser.schema]),
  ) as FastifySchema;
}
