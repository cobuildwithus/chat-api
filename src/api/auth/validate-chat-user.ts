import { requestContext } from "@fastify/request-context";
import type { FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import type { ChatUser } from "../../ai/types";
import { normalizeAddress } from "../../chat/address";
import {
  getSelfHostedDefaultAddress,
  getSelfHostedSharedSecret,
  isSelfHostedMode,
} from "../../config/env";
import { getUserAddressFromToken } from "./get-user-from-token";
import { setRequestUserFromHeaders } from "./set-request-user";

declare module "@fastify/request-context" {
  interface RequestContextData {
    user: ChatUser;
  }
}

function isValidSharedSecret(authHeader: string, sharedSecret: string): boolean {
  const authBuffer = Buffer.from(authHeader, "utf8");
  const secretBuffer = Buffer.from(sharedSecret, "utf8");
  if (authBuffer.length !== secretBuffer.length) {
    return false;
  }
  return timingSafeEqual(authBuffer, secretBuffer);
}

function normalizePrivyToken(rawToken: unknown): string | undefined {
  if (typeof rawToken !== "string") {
    return undefined;
  }

  const trimmed = rawToken.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/^"(.*)"$/, "$1");
}

export async function validateChatUser(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (isSelfHostedMode()) {
      const sharedSecret = getSelfHostedSharedSecret();
      if (!sharedSecret) {
        return reply.code(503).send({ error: "Self-hosted auth is misconfigured." });
      }
      const authHeader = request.headers["x-chat-auth"];
      if (!authHeader || typeof authHeader !== "string") {
        return reply.code(401).send({ error: "Missing chat auth" });
      }
      if (!isValidSharedSecret(authHeader, sharedSecret)) {
        return reply.code(401).send({ error: "Invalid chat auth" });
      }

      const headerAddress = request.headers["x-chat-user"];
      const rawAddress =
        (typeof headerAddress === "string" ? headerAddress : null) ??
        getSelfHostedDefaultAddress() ??
        null;
      if (!rawAddress) {
        return reply.code(401).send({ error: "Missing chat user" });
      }
      const normalizedAddress = normalizeAddress(rawAddress);
      if (!normalizedAddress) {
        return reply.code(401).send({ error: "Invalid chat user" });
      }

      setRequestUserFromHeaders(normalizedAddress, request);
      return;
    }

    const token = normalizePrivyToken(request.headers["privy-id-token"]);
    if (!token) {
      return reply.code(401).send({ error: "Missing privy id token" });
    }

    const address = await getUserAddressFromToken(token);
    const normalizedAddress = normalizeAddress(address);
    if (!normalizedAddress) {
      return reply.code(401).send({ error: "Invalid chat user" });
    }

    setRequestUserFromHeaders(normalizedAddress, request);
  } catch (error) {
    console.error("Error in validateChatUser middleware:", error);
    throw error;
  }
}

export function getChatUserOrThrow() {
  const user = requestContext.get("user");
  if (!user) throw new Error("User not found");
  return user;
}
