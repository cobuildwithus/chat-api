import { requestContext } from "@fastify/request-context";
import type { FastifyInstance } from "fastify";
import { summarizeRequestBody } from "./request-body-summary";

declare module "@fastify/request-context" {
  interface RequestContextData {
    requestStartMs?: number;
  }
}

const isDebugEnabled = () => {
  const flag = process.env.DEBUG_HTTP?.toLowerCase();
  return flag === "1" || flag === "true";
};

const SENSITIVE_BODY_FIELDS = new Set([
  "code",
  "code_verifier",
  "refresh_token",
  "id_token",
]);

function getSensitiveBodyFields(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [];
  }
  const record = body as Record<string, unknown>;
  return Object.keys(record)
    .filter((key) => SENSITIVE_BODY_FIELDS.has(key.toLowerCase()))
    .sort();
}

export const registerRequestLogging = (server: FastifyInstance) => {
  if (!isDebugEnabled()) return;

  server.addHook("onRequest", (request, _reply, done) => {
    requestContext.set("requestStartMs", Date.now());
    console.info("[req]", {
      id: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
    done();
  });

  server.addHook("preHandler", (request, _reply, done) => {
    if (request.method === "GET" || request.method === "HEAD") return done();
    const sensitiveFields = getSensitiveBodyFields(request.body);
    if (sensitiveFields.length > 0) {
      console.info("[req-body]", {
        id: request.id,
        url: request.url,
        summary: {
          redacted: true,
          sensitiveFields,
        },
      });
      return done();
    }
    const summary = summarizeRequestBody(request.body);
    if (summary) {
      console.info("[req-body]", {
        id: request.id,
        url: request.url,
        summary,
      });
    }
    done();
  });

  server.addHook("onResponse", (request, reply, done) => {
    const start = requestContext.get("requestStartMs");
    const durationMs = typeof start === "number" ? Date.now() - start : null;
    console.info("[res]", {
      id: request.id,
      method: request.method,
      url: request.url,
      status: reply.statusCode,
      durationMs,
    });
    done();
  });

  server.addHook("onError", (request, reply, error, done) => {
    console.error("[err]", {
      id: request.id,
      method: request.method,
      url: request.url,
      status: reply.statusCode,
      message: error instanceof Error ? error.message : String(error),
    });
    done();
  });
};
