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
  "access_token",
  "authorization",
  "client_secret",
  "code",
  "code_challenge",
  "code_verifier",
  "privy-id-token",
  "refresh_token",
  "id_token",
]);
const SENSITIVE_BODY_ENDPOINTS = new Set([
  "/oauth/token",
  "/oauth/authorize-code",
]);

function normalizeRequestPath(url: string): string {
  const [path] = url.split("?");
  return path ?? url;
}

function getSensitiveBodyFields(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [];
  }
  const record = body as Record<string, unknown>;
  return Object.keys(record)
    .filter((key) => SENSITIVE_BODY_FIELDS.has(key.toLowerCase()))
    .sort();
}

function hasRefreshTokenLikeValue(body: unknown): boolean {
  if (typeof body === "string") {
    return body.includes("rfr_");
  }
  if (typeof body === "number" || typeof body === "boolean" || body === null || body === undefined) {
    return false;
  }
  if (Array.isArray(body)) {
    return body.some((entry) => hasRefreshTokenLikeValue(entry));
  }
  if (typeof body === "object") {
    return Object.values(body as Record<string, unknown>).some((entry) => hasRefreshTokenLikeValue(entry));
  }
  return false;
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
    const path = normalizeRequestPath(request.url);
    const shouldRedactForEndpoint = SENSITIVE_BODY_ENDPOINTS.has(path);
    const sensitiveFields = getSensitiveBodyFields(request.body);
    const hasRefreshTokenValue = hasRefreshTokenLikeValue(request.body);
    if (shouldRedactForEndpoint || sensitiveFields.length > 0 || hasRefreshTokenValue) {
      console.info("[req-body]", {
        id: request.id,
        url: request.url,
        summary: {
          redacted: true,
          ...(shouldRedactForEndpoint ? { reason: "sensitive-endpoint" } : {}),
          sensitiveFields,
          ...(hasRefreshTokenValue ? { containsRefreshTokenLikeValue: true } : {}),
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
