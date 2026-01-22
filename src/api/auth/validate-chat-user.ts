import { requestContext } from "@fastify/request-context";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ChatUser } from "../../ai/types";
import { normalizeAddress } from "../../chat/address";
import {
  getSelfHostedDefaultAddress,
  getSelfHostedSharedSecret,
  isSelfHostedMode,
} from "../../config/env";
import { getUserAddressFromToken } from "./get-user-from-token";

declare module "@fastify/request-context" {
  interface RequestContextData {
    user: ChatUser;
  }
}

export async function validateChatUser(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (isSelfHostedMode()) {
      const sharedSecret = getSelfHostedSharedSecret();
      if (sharedSecret) {
        const authHeader = request.headers["x-chat-auth"];
        if (!authHeader || typeof authHeader !== "string") {
          return reply.code(401).send({ error: "Missing chat auth" });
        }
        if (authHeader !== sharedSecret) {
          return reply.code(401).send({ error: "Invalid chat auth" });
        }
      }

      const headerAddress = request.headers["x-chat-user"];
      const rawAddress =
        (typeof headerAddress === "string" ? headerAddress : null) ??
        getSelfHostedDefaultAddress();
      const normalizedAddress = normalizeAddress(rawAddress ?? "");
      if (!normalizedAddress) {
        return reply.code(401).send({ error: "Missing chat user" });
      }

      requestContext.set("user", {
        address: normalizedAddress,
        city: request.headers["city"]?.toString() ?? null,
        country: request.headers["country"]?.toString() ?? null,
        countryRegion: request.headers["country-region"]?.toString() ?? null,
        userAgent: request.headers["user-agent"]?.toString() ?? null,
      });
      return;
    }

    const token = request.headers["privy-id-token"];

    if (!token || typeof token !== "string") {
      return reply.code(401).send({ error: "Missing privy id token" });
    }

    const address = await getUserAddressFromToken(token.replace('"', ""));
    const normalizedAddress = normalizeAddress(address);
    if (!normalizedAddress) {
      return reply.code(401).send({ error: "Invalid chat user" });
    }

    requestContext.set("user", {
      address: normalizedAddress,
      city: request.headers["city"]?.toString() ?? null,
      country: request.headers["country"]?.toString() ?? null,
      countryRegion: request.headers["country-region"]?.toString() ?? null,
      userAgent: request.headers["user-agent"]?.toString() ?? null,
    });
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
