import type { FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import {
  getSelfHostedDefaultAddress,
  isSelfHostedModeAllowedAtRuntime,
  getSelfHostedSharedSecret,
  isSelfHostedMode,
} from "../../config/env";
import { getPublicError, toPublicErrorBody } from "../../public-errors";
import { getUserAddressFromToken } from "./get-user-from-token";
import {
  getChatUserPrincipalOrThrow,
  normalizeSubjectWallet,
  setChatUserPrincipalFromRequest,
} from "./principals";

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
      if (!isSelfHostedModeAllowedAtRuntime()) {
        const error = getPublicError("chatAuthMisconfigured");
        return reply.code(error.statusCode).send(toPublicErrorBody("chatAuthMisconfigured"));
      }
      const sharedSecret = getSelfHostedSharedSecret();
      if (!sharedSecret) {
        const error = getPublicError("chatAuthMisconfigured");
        return reply.code(error.statusCode).send(toPublicErrorBody("chatAuthMisconfigured"));
      }
      const authHeader = request.headers["x-chat-auth"];
      if (!authHeader || typeof authHeader !== "string") {
        const error = getPublicError("chatAuthRequired");
        return reply.code(error.statusCode).send(toPublicErrorBody("chatAuthRequired"));
      }
      if (!isValidSharedSecret(authHeader, sharedSecret)) {
        const error = getPublicError("chatAuthInvalid");
        return reply.code(error.statusCode).send(toPublicErrorBody("chatAuthInvalid"));
      }

      const headerAddress = request.headers["x-chat-user"];
      const rawAddress =
        (typeof headerAddress === "string" ? headerAddress : null) ??
        getSelfHostedDefaultAddress() ??
        null;
      if (!rawAddress) {
        const error = getPublicError("chatUserRequired");
        return reply.code(error.statusCode).send(toPublicErrorBody("chatUserRequired"));
      }
      const normalizedAddress = normalizeSubjectWallet(rawAddress);
      if (!normalizedAddress) {
        const error = getPublicError("chatUserInvalid");
        return reply.code(error.statusCode).send(toPublicErrorBody("chatUserInvalid"));
      }

      setChatUserPrincipalFromRequest(normalizedAddress, request);
      return;
    }

    const token = normalizePrivyToken(request.headers["privy-id-token"]);
    if (!token) {
      const error = getPublicError("chatTokenRequired");
      return reply.code(error.statusCode).send(toPublicErrorBody("chatTokenRequired"));
    }

    const address = await getUserAddressFromToken(token);
    const normalizedAddress = normalizeSubjectWallet(address);
    if (!normalizedAddress) {
      const error = getPublicError("chatUserInvalid");
      return reply.code(error.statusCode).send(toPublicErrorBody("chatUserInvalid"));
    }

    setChatUserPrincipalFromRequest(normalizedAddress, request);
  } catch (error) {
    console.error("Error in validateChatUser middleware:", error);
    throw error;
  }
}

export function getChatUserOrThrow() {
  return getChatUserPrincipalOrThrow();
}
