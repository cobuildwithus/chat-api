import type { FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import {
  getSelfHostedDefaultAddress,
  isSelfHostedModeAllowedAtRuntime,
  getSelfHostedSharedSecret,
  isSelfHostedMode,
} from "../../config/env";
import {
  getPublicError,
  toPublicErrorBody,
  type PublicErrorKey,
} from "../../public-errors";
import { getUserAddressFromToken } from "./get-user-from-token";
import {
  getChatUserPrincipalOrThrow,
  normalizeSubjectWallet,
  setChatUserPrincipalFromRequest,
  type ChatUserPrincipal,
  type SubjectWallet,
} from "./principals";

type ChatUserAddressResolution =
  | { ok: true; address: SubjectWallet }
  | { ok: false; errorKey: PublicErrorKey };

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

function resolveAddress(address: unknown): SubjectWallet | null {
  return normalizeSubjectWallet(address);
}

function failAddressResolution(errorKey: PublicErrorKey): ChatUserAddressResolution {
  return { ok: false, errorKey };
}

function replyWithPublicError(reply: FastifyReply, errorKey: PublicErrorKey) {
  const error = getPublicError(errorKey);
  return reply.code(error.statusCode).send(toPublicErrorBody(errorKey));
}

function resolveSelfHostedChatUserAddress(
  request: FastifyRequest,
): ChatUserAddressResolution {
  if (!isSelfHostedModeAllowedAtRuntime()) {
    return failAddressResolution("chatAuthMisconfigured");
  }

  const sharedSecret = getSelfHostedSharedSecret();
  if (!sharedSecret) {
    return failAddressResolution("chatAuthMisconfigured");
  }

  const authHeader = request.headers["x-chat-auth"];
  if (!authHeader || typeof authHeader !== "string") {
    return failAddressResolution("chatAuthRequired");
  }

  if (!isValidSharedSecret(authHeader, sharedSecret)) {
    return failAddressResolution("chatAuthInvalid");
  }

  const headerAddress = request.headers["x-chat-user"];
  const rawAddress =
    (typeof headerAddress === "string" ? headerAddress : null) ??
    getSelfHostedDefaultAddress() ??
    null;
  if (!rawAddress) {
    return failAddressResolution("chatUserRequired");
  }

  const address = resolveAddress(rawAddress);
  if (!address) {
    return failAddressResolution("chatUserInvalid");
  }

  return { ok: true, address };
}

async function resolveTokenChatUserAddress(
  request: FastifyRequest,
): Promise<ChatUserAddressResolution> {
  const token = normalizePrivyToken(request.headers["privy-id-token"]);
  if (!token) {
    return failAddressResolution("chatTokenRequired");
  }

  const address = resolveAddress(await getUserAddressFromToken(token));
  if (!address) {
    return failAddressResolution("chatUserInvalid");
  }

  return { ok: true, address };
}

async function resolveChatUserAddress(
  request: FastifyRequest,
): Promise<ChatUserAddressResolution> {
  if (isSelfHostedMode()) {
    return resolveSelfHostedChatUserAddress(request);
  }

  return resolveTokenChatUserAddress(request);
}

export async function validateChatUser(request: FastifyRequest, reply: FastifyReply) {
  try {
    const resolution = await resolveChatUserAddress(request);
    if (!resolution.ok) {
      return replyWithPublicError(reply, resolution.errorKey);
    }

    setChatUserPrincipalFromRequest(resolution.address, request);
  } catch (error) {
    console.error("Error in validateChatUser middleware:", error);
    throw error;
  }
}

export function getChatUserOrThrow(): ChatUserPrincipal {
  return getChatUserPrincipalOrThrow();
}
