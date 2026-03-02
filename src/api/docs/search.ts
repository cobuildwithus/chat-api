import type { FastifyReply, FastifyRequest } from "fastify";
import { checkAndRecordUsage } from "../../infra/rate-limit";
import { executeTool } from "../tools/registry";

const DOCS_SEARCH_RATE_LIMIT_WINDOW_SECONDS = 60;
const DOCS_SEARCH_RATE_LIMIT_WINDOW_MINUTES = DOCS_SEARCH_RATE_LIMIT_WINDOW_SECONDS / 60;
const DOCS_SEARCH_RATE_LIMIT_MAX = process.env.NODE_ENV === "production" ? 30 : 200;

function getDocsSearchRateLimitKey(request: FastifyRequest): string {
  if (request.ip && request.ip.trim().length > 0) {
    return `docs-search:ip:${request.ip}`;
  }
  return "docs-search:ip:unknown";
}

export async function enforceDocsSearchRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const limit = await checkAndRecordUsage(getDocsSearchRateLimitKey(request), {
      windowMinutes: DOCS_SEARCH_RATE_LIMIT_WINDOW_MINUTES,
      maxUsage: DOCS_SEARCH_RATE_LIMIT_MAX,
      usageToAdd: 1,
    });
    if (limit.allowed) return;
    reply.header("Retry-After", String(limit.retryAfterSeconds));
    return reply.status(429).send({
      error: "Too many docs search requests. Please retry shortly.",
    });
  } catch (error) {
    console.error("[docs-search] rate limit failed", error);
    return reply.status(503).send({
      error: "Docs search rate limiting is temporarily unavailable. Please retry.",
    });
  }
}

export async function handleDocsSearchRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const result = await executeTool("docs-search", request.body);
  if (!result.ok) {
    return reply.status(result.statusCode).send({
      error: result.error,
    });
  }
  return reply.send(result.output);
}
