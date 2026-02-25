import { eq, sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getNeynarTimeoutMs } from "../../config/env";
import { getOrSetCachedResultWithLock } from "../../infra/cache/cacheResult";
import { farcasterProfiles } from "../../infra/db/schema";
import { cobuildDb } from "../../infra/db/cobuildDb";
import { withTimeout } from "../../infra/http/timeout";
import { getNeynarClient } from "../../infra/neynar/client";
import { checkAndRecordUsage } from "../../infra/rate-limit";
import { formatCobuildAiContextError, getCobuildAiContextSnapshot } from "../../infra/cobuild-ai-context";

const NO_STORE_CACHE_CONTROL = "no-store";
const SHORT_PRIVATE_CACHE_CONTROL = "private, max-age=60";
const SHORT_PUBLIC_CACHE_CONTROL = "public, max-age=60";

const GET_USER_CACHE_PREFIX = "farcaster:get-user:";
const GET_USER_CACHE_TTL_SECONDS = 60 * 10;

const GET_CAST_CACHE_PREFIX = "buildbot-tools:get-cast:";
const GET_CAST_CACHE_TTL_SECONDS = 60 * 2;

const BUILD_BOT_TOOLS_RATE_LIMIT_WINDOW_SECONDS = 60;
const BUILD_BOT_TOOLS_RATE_LIMIT_WINDOW_MINUTES = BUILD_BOT_TOOLS_RATE_LIMIT_WINDOW_SECONDS / 60;
const BUILD_BOT_TOOLS_RATE_LIMIT_MAX = process.env.NODE_ENV === "production" ? 120 : 600;

type GetUserBody = {
  fname: string;
};

type GetCastBody = {
  identifier: string;
  type: "hash" | "url";
};

type CastPreviewBody = {
  text: string;
  embeds?: Array<{ url: string }>;
  parent?: string;
};

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

export async function handleBuildBotToolsGetUserRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = request.body as GetUserBody;
  const fname = body.fname.trim();
  if (!fname) {
    return reply.status(400).send({ error: "fname must not be empty." });
  }

  try {
    const cacheKey = fname.toLowerCase();
    const result = await getOrSetCachedResultWithLock(
      cacheKey,
      GET_USER_CACHE_PREFIX,
      async () => {
        const user = await cobuildDb
          .select()
          .from(farcasterProfiles)
          .where(eq(farcasterProfiles.fname, fname))
          .limit(1)
          .then((rows) => rows[0]);

        if (!user) {
          const users = await cobuildDb
            .select()
            .from(farcasterProfiles)
            .where(sql`${farcasterProfiles.fname} ILIKE ${`%${fname}%`}`);
          return { usedLikeQuery: true, users };
        }

        return {
          fid: user.fid,
          fname: user.fname,
          addresses: user.verifiedAddresses || [],
        };
      },
      GET_USER_CACHE_TTL_SECONDS,
    );

    reply.header("Cache-Control", SHORT_PRIVATE_CACHE_CONTROL);
    return reply.send({ ok: true, result });
  } catch (error) {
    return reply.status(502).send({
      error: `get-user request failed: ${formatCobuildAiContextError(error)}`,
    });
  }
}

export async function handleBuildBotToolsGetCastRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = request.body as GetCastBody;
  const identifier = body.identifier.trim();
  const { type } = body;

  if (!identifier) {
    return reply.status(400).send({ error: "identifier must not be empty." });
  }

  try {
    const cacheKey = `${type}:${identifier.toLowerCase()}`;
    const cast = await getOrSetCachedResultWithLock(
      cacheKey,
      GET_CAST_CACHE_PREFIX,
      async () => {
        const neynarClient = getNeynarClient();
        if (!neynarClient) {
          throw new Error("Neynar API key is not configured.");
        }

        const response = await withTimeout(
          neynarClient.lookupCastByHashOrUrl({ identifier, type }),
          getNeynarTimeoutMs(),
          "Neynar getCast",
        );
        return response.cast ?? null;
      },
      GET_CAST_CACHE_TTL_SECONDS,
    );

    if (!cast) {
      return reply.status(404).send({ error: "Cast not found." });
    }

    reply.header("Cache-Control", SHORT_PRIVATE_CACHE_CONTROL);
    return reply.send({ ok: true, cast });
  } catch (error) {
    const message = formatCobuildAiContextError(error);
    const isConfigError = message.includes("Neynar API key is not configured");
    return reply.status(isConfigError ? 503 : 502).send({
      error: `get-cast request failed: ${message}`,
    });
  }
}

export async function handleBuildBotToolsCastPreviewRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = request.body as CastPreviewBody;
  const text = body.text.trim();
  if (!text) {
    return reply.status(400).send({ error: "text must not be empty." });
  }

  const preview = {
    text,
    ...(body.embeds ? { embeds: body.embeds } : {}),
    ...(body.parent ? { parent: body.parent } : {}),
  };

  reply.header("Cache-Control", NO_STORE_CACHE_CONTROL);
  return reply.send({
    ok: true,
    cast: preview,
  });
}

export async function handleBuildBotToolsCobuildAiContextRequest(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const snapshot = await getCobuildAiContextSnapshot();
    if (!snapshot.data) {
      return reply.status(502).send({
        error: `cobuild-ai-context request failed: ${snapshot.error ?? "unknown error"}`,
      });
    }

    reply.header("Cache-Control", SHORT_PUBLIC_CACHE_CONTROL);
    return reply.send({
      ok: true,
      data: snapshot.data,
    });
  } catch (error) {
    return reply.status(502).send({
      error: `cobuild-ai-context request failed: ${formatCobuildAiContextError(error)}`,
    });
  }
}
