import cors from "@fastify/cors";
import { fastifyRequestContext } from "@fastify/request-context";
import fastify from "fastify";
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
import { handleError } from "./server-helpers";
import { registerRequestLogging } from "./request-logger";

const DEFAULT_PROD_ORIGINS = ["https://co.build", "https://www.co.build"];

const getAllowedOrigins = () => {
  const raw = process.env.CHAT_ALLOWED_ORIGINS;
  if (raw) {
    const parsed = raw
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
    if (parsed.length > 0) return parsed;
  }
  return process.env.NODE_ENV === "production" ? DEFAULT_PROD_ORIGINS : "http://localhost:3000";
};

export const setupServer = async () => {
  const server = fastify();
  server.register(fastifyRequestContext);
  registerRequestLogging(server);

  server.register(cors, {
    origin: getAllowedOrigins(),
    credentials: true,
    allowedHeaders: [
      "content-type",
      "privy-id-token",
      "x-chat-grant",
      "x-client-device",
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
