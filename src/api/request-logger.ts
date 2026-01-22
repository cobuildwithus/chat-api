import { requestContext } from "@fastify/request-context";
import type { FastifyInstance } from "fastify";

declare module "@fastify/request-context" {
  interface RequestContextData {
    requestStartMs?: number;
  }
}

const isDebugEnabled = () => {
  const flag = process.env.DEBUG_HTTP?.toLowerCase();
  return flag === "1" || flag === "true";
};

const summarizeBody = (body: unknown) => {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  if (typeof record.type === "string") summary.type = record.type;
  if (typeof record.id === "string") summary.id = record.id;
  if (Array.isArray(record.messages)) summary.messageCount = record.messages.length;
  if (record.data && typeof record.data === "object") {
    summary.dataKeys = Object.keys(record.data as Record<string, unknown>);
  }

  return Object.keys(summary).length > 0 ? summary : null;
};

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
    const summary = summarizeBody(request.body);
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
