import cors from "@fastify/cors";
import { fastifyRequestContext, requestContext } from "@fastify/request-context";
import rateLimit from "@fastify/rate-limit";
import { parseBearerToken } from "@cobuild/wire";
import fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { handleChatCreateRequest } from "./chat/create";
import { handleChatGetRequest } from "./chat/get";
import { handleChatListRequest } from "./chat/list";
import { handleChatPostRequest } from "./chat/route";
import { handleCobuildAiContextRequest } from "./cobuild-ai-context/route";
import { enforceToolsBearerAuth } from "./tools/internal-auth";
import {
  handleCliSessionRevokeRequest,
  handleCliSessionsListRequest,
  handleOauthAuthorizeCodeRequest,
  handleOauthTokenRequest,
} from "./oauth/route";
import {
  cliSessionRevokeSchema,
  cliSessionsListSchema,
  oauthAuthorizeCodeSchema,
  oauthTokenSchema,
} from "./oauth/schema";
import {
  handleToolExecutionRequest,
  handleToolMetadataRequest,
  handleToolsListRequest,
} from "./tools/route";
import { validateChatUser } from "./auth/validate-chat-user";
import {
  chatCreateSchema,
  chatGetSchema,
  chatListSchema,
  chatSchema,
} from "./chat/schema";
import { toolExecutionSchema, toolMetadataSchema, toolsListSchema } from "./tools/schema";
import { getRateLimitConfig } from "../config/env";
import { handleError } from "./server-helpers";
import { registerRequestLogging } from "./request-logger";
import { digestOAuthSecret } from "./oauth/security";

const DEFAULT_PROD_ORIGINS = ["https://co.build", "https://www.co.build"];
const DEFAULT_SOURCE_URL = "https://github.com/cobuildwithus/chat-api";
type TrustProxySetting = boolean | number | string | string[];
const SERVER_TIMEOUTS = {
  headersTimeoutMs: 60_000,
  requestTimeoutMs: 120_000,
  keepAliveTimeoutMs: 5_000,
  socketTimeoutMs: 120_000,
  maxRequestsPerSocket: 1_000,
};

const applyServerTimeouts = (server: FastifyInstance["server"]) => {
  server.headersTimeout = SERVER_TIMEOUTS.headersTimeoutMs;
  server.requestTimeout = SERVER_TIMEOUTS.requestTimeoutMs;
  server.keepAliveTimeout = SERVER_TIMEOUTS.keepAliveTimeoutMs;
  server.maxRequestsPerSocket = SERVER_TIMEOUTS.maxRequestsPerSocket;
  server.setTimeout(SERVER_TIMEOUTS.socketTimeoutMs);
};

const IP_RATE_LIMIT_MULTIPLIER = 3;
const TOOL_EXECUTIONS_BODY_LIMIT_BYTES = 64 * 1024;
const TOOLS_RATE_LIMIT_PATH_PREFIXES = ["/v1/tool-executions", "/v1/tools"];

function hashRateLimitToken(rawToken: string): string {
  return digestOAuthSecret(rawToken);
}

function isToolsRateLimitPath(path: string): boolean {
  const normalizedPath = path.split("?", 1)[0] ?? path;
  return TOOLS_RATE_LIMIT_PATH_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
}

const getAllowedOrigins = () => {
  const raw = process.env.CHAT_ALLOWED_ORIGINS;
  const isProd = process.env.NODE_ENV === "production";
  if (raw) {
    const parsed = raw
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
    if (parsed.length > 0) {
      if (isProd) {
        return Array.from(new Set([...DEFAULT_PROD_ORIGINS, ...parsed]));
      }
      return parsed;
    }
  }
  return isProd ? DEFAULT_PROD_ORIGINS : "http://localhost:3000";
};

const getSourceUrl = () => {
  const raw = process.env.SOURCE_CODE_URL;
  if (raw && raw.trim().length > 0) {
    return raw.trim();
  }
  return DEFAULT_SOURCE_URL;
};

const getTrustProxySetting = (): TrustProxySetting => {
  const raw = process.env.CHAT_TRUST_PROXY?.trim();
  if (!raw) {
    return false;
  }

  const normalized = raw.toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }

  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  if (raw.includes(",")) {
    const trusted = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (trusted.length > 1) {
      return trusted;
    }
    if (trusted.length === 1) {
      return trusted[0];
    }
    return false;
  }

  return raw;
};

export const setupServer = async () => {
  const server = fastify({
    trustProxy: getTrustProxySetting(),
  });
  applyServerTimeouts(server.server);
  server.register(fastifyRequestContext);
  registerRequestLogging(server);

  const rateLimitConfig = getRateLimitConfig();
  if (rateLimitConfig.enabled) {
    const ipMax = Math.max(1, Math.floor(rateLimitConfig.max * IP_RATE_LIMIT_MULTIPLIER));
    server.register(rateLimit, {
      max: ipMax,
      timeWindow: rateLimitConfig.windowMs,
      hook: "onRequest",
      keyGenerator: (request) => {
        const routerPath = (request as { routerPath?: string }).routerPath;
        const requestPath = routerPath ?? request.url ?? "";
        if (isToolsRateLimitPath(requestPath)) {
          const bearerToken = parseBearerToken(
            typeof request.headers.authorization === "string" ? request.headers.authorization : undefined,
          );
          if (bearerToken) {
            return `tools-token:${hashRateLimitToken(bearerToken)}`;
          }
        }
        return request.ip;
      },
    });
    server.register(rateLimit, {
      max: rateLimitConfig.max,
      timeWindow: rateLimitConfig.windowMs,
      hook: "preHandler",
      keyGenerator: (request) => {
        const toolsPrincipal = requestContext.get("toolsPrincipal");
        if (toolsPrincipal) {
          return `tools:${toolsPrincipal.ownerAddress}:${toolsPrincipal.agentKey}:${toolsPrincipal.sessionId}`;
        }
        const routerPath = (request as { routerPath?: string }).routerPath;
        const requestPath = routerPath ?? request.url ?? "";
        if (isToolsRateLimitPath(requestPath)) {
          const bearerToken = parseBearerToken(
            typeof request.headers.authorization === "string" ? request.headers.authorization : undefined,
          );
          if (bearerToken) {
            return `tools-token:${hashRateLimitToken(bearerToken)}`;
          }
        }

        const user = requestContext.get("user");
        if (user?.address) {
          return `user:${user.address}`;
        }
        return request.ip;
      },
    });
  }

  server.register(cors, {
    origin: getAllowedOrigins(),
    credentials: true,
    allowedHeaders: [
      "authorization",
      "content-type",
      "privy-id-token",
      "x-chat-grant",
      "x-client-device",
      "x-chat-user",
      "x-chat-auth",
      "city",
      "country",
      "country-region",
    ],
    exposedHeaders: ["x-chat-grant"],
  });

  server.post(
    "/api/chat",
    { preValidation: [validateChatUser], schema: chatSchema },
    handleChatPostRequest,
  );

  server.get("/api/cobuild/ai-context", handleCobuildAiContextRequest);

  server.post(
    "/v1/tool-executions",
    {
      preValidation: [enforceToolsBearerAuth],
      schema: toolExecutionSchema,
      bodyLimit: TOOL_EXECUTIONS_BODY_LIMIT_BYTES,
    },
    handleToolExecutionRequest,
  );

  server.get(
    "/v1/tools",
    {
      preValidation: [enforceToolsBearerAuth],
      schema: toolsListSchema,
    },
    handleToolsListRequest,
  );

  server.get(
    "/v1/tools/:name",
    {
      preValidation: [enforceToolsBearerAuth],
      schema: toolMetadataSchema,
    },
    handleToolMetadataRequest,
  );

  server.get(
    "/v1/sessions",
    {
      preValidation: [validateChatUser],
      schema: cliSessionsListSchema,
    },
    handleCliSessionsListRequest,
  );

  server.post(
    "/oauth/authorize-code",
    {
      preValidation: [validateChatUser],
      schema: oauthAuthorizeCodeSchema,
    },
    handleOauthAuthorizeCodeRequest,
  );

  server.post(
    "/oauth/token",
    {
      schema: oauthTokenSchema,
    },
    handleOauthTokenRequest,
  );

  server.delete(
    "/v1/sessions",
    {
      preValidation: [validateChatUser],
      schema: cliSessionRevokeSchema,
    },
    handleCliSessionRevokeRequest,
  );

  server.get("/source", async (_request, reply) => {
    const sourceUrl = getSourceUrl();
    reply.header("X-Source-URL", sourceUrl);
    return {
      license: "AGPL-3.0-or-later",
      source: sourceUrl,
      notice:
        "If you are interacting with this service over a network, you can obtain the corresponding source code from the URL above.",
    };
  });

  server.post(
    "/api/chat/new",
    { preValidation: [validateChatUser], schema: chatCreateSchema },
    handleChatCreateRequest,
  );

  server.get(
    "/api/chats",
    { preValidation: [validateChatUser], schema: chatListSchema },
    handleChatListRequest,
  );

  server.get(
    "/api/chat/:chatId",
    { preValidation: [validateChatUser], schema: chatGetSchema },
    handleChatGetRequest,
  );

  server.setErrorHandler(handleError);

  return server;
};
