import { requestContext } from "@fastify/request-context";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ChatUser } from "../../ai/types";
import { normalizeAddress } from "../../chat/address";
import { getUserAddressFromToken } from "./get-user-from-token";

declare module "@fastify/request-context" {
  interface RequestContextData {
    user: ChatUser;
  }
}

export async function validateChatUser(request: FastifyRequest, reply: FastifyReply) {
  try {
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
