import fastify from "fastify";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { chatListSchema } from "../../src/api/chat/schema";
import {
  buildFastifyRouteSchema,
  createRuntimeSchemaParser,
} from "../../src/api/zod-route-schema";

describe("zod route schema helpers", () => {
  it("creates draft-7 JSON schema from a runtime parser", () => {
    const parser = createRuntimeSchemaParser(
      z.strictObject({
        name: z.string(),
      }),
    );

    expect(parser.parse({ name: "alice" })).toEqual({ name: "alice" });
    expect(parser.schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(parser.schema.additionalProperties).toBe(false);
  });

  it("maps parser parts into the Fastify schema shape", () => {
    const bodyParser = createRuntimeSchemaParser(z.strictObject({ ok: z.boolean() }));
    const headersParser = createRuntimeSchemaParser(
      z.looseObject({ authorization: z.string().min(1) }),
    );

    const schema = buildFastifyRouteSchema({
      body: bodyParser,
      headers: headersParser,
    }) as {
      body: Record<string, unknown>;
      headers: Record<string, unknown>;
    };

    expect(schema.body).toEqual(bodyParser.schema);
    expect(schema.headers).toEqual(headersParser.schema);
  });

  it("works through Fastify validation for querystring coercion", async () => {
    const app = fastify();
    app.get(
      "/api/chats",
      { schema: chatListSchema },
      async (request) => ({ query: request.query }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/chats?limit=5",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      query: {
        limit: 5,
      },
    });

    await app.close();
  });
});
