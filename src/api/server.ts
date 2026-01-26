import cors from "@fastify/cors";
import { fastifyRequestContext, requestContext } from "@fastify/request-context";
import rateLimit from "@fastify/rate-limit";
import fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { handleChatCreateRequest } from "./chat/create";
import { handleChatGetRequest } from "./chat/get";
import { handleChatListRequest } from "./chat/list";
import { handleChatPostRequest } from "./chat/route";
import { validateChatUser } from "./auth/validate-chat-user";
import {
  chatCreateSchema,
  chatGetSchema,
  chatListSchema,
  chatSchema,
} from "./chat/schema";
import { getRateLimitConfig } from "../config/env";
import { handleError } from "./server-helpers";
import { registerRequestLogging } from "./request-logger";

const DEFAULT_PROD_ORIGINS = ["https://co.build", "https://www.co.build"];
const DEFAULT_SOURCE_URL = "https://github.com/cobuildwithus/chat-api";
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

export const setupServer = async () => {
  const server = fastify();
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
      keyGenerator: (request) => request.ip,
    });
    server.register(rateLimit, {
      max: rateLimitConfig.max,
      timeWindow: rateLimitConfig.windowMs,
      hook: "preHandler",
      keyGenerator: (request) => {
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
    { preHandler: [validateChatUser], schema: chatSchema },
    handleChatPostRequest,
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
    { preHandler: [validateChatUser], schema: chatCreateSchema },
    handleChatCreateRequest,
  );

  server.get(
    "/api/chats",
    { preHandler: [validateChatUser], schema: chatListSchema },
    handleChatListRequest,
  );

  server.get(
    "/api/chat/:chatId",
    { preHandler: [validateChatUser], schema: chatGetSchema },
    handleChatGetRequest,
  );

  server.setErrorHandler(handleError);

  return server;
};
