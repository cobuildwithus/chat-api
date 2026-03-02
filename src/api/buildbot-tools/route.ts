import type { FastifyReply, FastifyRequest } from "fastify";
import { getChatInternalServiceKey } from "../../config/env";
import { checkAndRecordUsage } from "../../infra/rate-limit";
import { executeTool } from "../tools/registry";

const BUILD_BOT_TOOLS_RATE_LIMIT_WINDOW_SECONDS = 60;
const BUILD_BOT_TOOLS_RATE_LIMIT_WINDOW_MINUTES = BUILD_BOT_TOOLS_RATE_LIMIT_WINDOW_SECONDS / 60;
const BUILD_BOT_TOOLS_RATE_LIMIT_MAX = process.env.NODE_ENV === "production" ? 60 : 300;

function getBuildBotToolsRateLimitKey(request: FastifyRequest): string {
  if (request.ip && request.ip.trim().length > 0) {
    return `buildbot-tools:ip:${request.ip}`;
  }
  return "buildbot-tools:ip:unknown";
}

export async function enforceBuildBotToolsRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const limit = await checkAndRecordUsage(getBuildBotToolsRateLimitKey(request), {
      windowMinutes: BUILD_BOT_TOOLS_RATE_LIMIT_WINDOW_MINUTES,
      maxUsage: BUILD_BOT_TOOLS_RATE_LIMIT_MAX,
      usageToAdd: 1,
    });
    if (limit.allowed) return;
    reply.header("Retry-After", String(limit.retryAfterSeconds));
    return reply.status(429).send({
      error: "Too many Build Bot tool requests. Please retry shortly.",
    });
  } catch (error) {
    console.error("[buildbot-tools] rate limit failed", error);
    return reply.status(503).send({
      error: "Build Bot tool rate limiting is temporarily unavailable. Please retry.",
    });
  }
}

export async function enforceBuildBotToolsInternalServiceAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const configuredKey = getChatInternalServiceKey();
  if (!configuredKey) {
    return reply.status(503).send({
      error: "Internal service auth is temporarily unavailable. Please retry.",
    });
  }

  const requestKey = request.headers["x-chat-internal-key"];
  if (typeof requestKey !== "string" || requestKey !== configuredKey) {
    return reply.status(401).send({ error: "Unauthorized." });
  }
}

export async function handleBuildBotToolsGetUserRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const result = await executeTool("get-user", request.body);
  if (!result.ok) {
    return reply.status(result.statusCode).send({ error: result.error });
  }

  if (result.cacheControl) {
    reply.header("Cache-Control", result.cacheControl);
  }
  return reply.send({ ok: true, result: result.output });
}

export async function handleBuildBotToolsGetCastRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const result = await executeTool("get-cast", request.body);
  if (!result.ok) {
    return reply.status(result.statusCode).send({ error: result.error });
  }

  if (result.cacheControl) {
    reply.header("Cache-Control", result.cacheControl);
  }
  return reply.send({ ok: true, cast: result.output });
}

export async function handleBuildBotToolsCastPreviewRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const result = await executeTool("cast-preview", request.body);
  if (!result.ok) {
    return reply.status(result.statusCode).send({ error: result.error });
  }

  if (result.cacheControl) {
    reply.header("Cache-Control", result.cacheControl);
  }
  return reply.send({
    ok: true,
    cast: result.output,
  });
}

export async function handleBuildBotToolsCobuildAiContextRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const result = await executeTool("cobuild-ai-context", request.body);
  if (!result.ok) {
    return reply.status(result.statusCode).send({ error: result.error });
  }

  if (result.cacheControl) {
    reply.header("Cache-Control", result.cacheControl);
  }
  return reply.send({
    ok: true,
    data: result.output,
  });
}
