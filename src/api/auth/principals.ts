import { requestContext } from "@fastify/request-context";
import {
  deriveCliScopeCapabilities,
  normalizeEvmAddress,
  splitScope,
} from "@cobuild/wire";
import type { FastifyRequest } from "fastify";
import { isTrustedProxyConfigured } from "../../config/env";
import type { ChatUser, SubjectWallet } from "../../types/chat-user";

export type { SubjectWallet } from "../../types/chat-user";
export type ChatUserPrincipal = ChatUser;

type ChatUserPrincipalInput = Omit<ChatUserPrincipal, "address"> & {
  address: string;
};

export type ToolsPrincipal = {
  sessionId: string;
  ownerAddress: SubjectWallet;
  agentKey: string;
  scope: string;
  scopes: string[];
  hasToolsRead: boolean;
  hasToolsWrite: boolean;
  hasWalletExecute: boolean;
  hasAnyWriteScope: boolean;
};

const MAX_GEO_HEADER_CHARS = 120;
const MAX_USER_AGENT_CHARS = 512;

declare module "@fastify/request-context" {
  interface RequestContextData {
    user: ChatUserPrincipal;
    toolsPrincipal?: ToolsPrincipal;
  }
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalHeader(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const sanitized = value.replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
  return sanitized.length > 0 ? sanitized : null;
}

function asBoundedHeader(value: unknown, maxLength: number): string | null {
  const sanitized = asOptionalHeader(value);
  if (!sanitized) {
    return null;
  }
  return sanitized.length <= maxLength ? sanitized : sanitized.slice(0, maxLength);
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function normalizeSubjectWallet(value: unknown): SubjectWallet | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return normalizeEvmAddress(value, "subject wallet") as SubjectWallet;
  } catch {
    return null;
  }
}

export function createChatUserPrincipal(
  address: SubjectWallet,
  request: Pick<FastifyRequest, "headers">,
): ChatUserPrincipal {
  const trustGeoHeaders = isTrustedProxyConfigured();
  return {
    address,
    city: trustGeoHeaders ? asBoundedHeader(request.headers["city"], MAX_GEO_HEADER_CHARS) : null,
    country: trustGeoHeaders
      ? asBoundedHeader(request.headers["country"], MAX_GEO_HEADER_CHARS)
      : null,
    countryRegion: trustGeoHeaders
      ? asBoundedHeader(request.headers["country-region"], MAX_GEO_HEADER_CHARS)
      : null,
    userAgent: asBoundedHeader(request.headers["user-agent"], MAX_USER_AGENT_CHARS),
  };
}

export function setChatUserPrincipal(principal: ChatUserPrincipalInput): void {
  const address = normalizeSubjectWallet(principal.address);
  if (!address) {
    throw new Error("Invalid user address");
  }

  requestContext.set("user", {
    ...principal,
    address,
  });
}

export function setChatUserPrincipalFromRequest(
  address: SubjectWallet,
  request: Pick<FastifyRequest, "headers">,
): void {
  setChatUserPrincipal(createChatUserPrincipal(address, request));
}

export function getChatUserPrincipal(): ChatUserPrincipal | null {
  try {
    const raw = requestContext.get("user") as Record<string, unknown> | undefined;
    const address = normalizeSubjectWallet(raw?.address);
    if (!address) {
      return null;
    }

    return {
      address,
      city: asString(raw?.city),
      country: asString(raw?.country),
      countryRegion: asString(raw?.countryRegion),
      userAgent: asString(raw?.userAgent),
    };
  } catch {
    return null;
  }
}

export function getChatUserPrincipalOrThrow(): ChatUserPrincipal {
  const principal = getChatUserPrincipal();
  if (!principal) {
    throw new Error("User not found");
  }
  return principal;
}

export function createToolsPrincipal(principal: ToolsPrincipal): ToolsPrincipal {
  return {
    ...principal,
    scopes: [...principal.scopes],
  };
}

export function setToolsPrincipal(principal: ToolsPrincipal): void {
  requestContext.set("toolsPrincipal", createToolsPrincipal(principal));
}

export function hasToolsPrincipalContext(): boolean {
  try {
    return requestContext.get("toolsPrincipal") !== undefined;
  } catch {
    return false;
  }
}

export function getToolsPrincipal(): ToolsPrincipal | null {
  try {
    const raw = requestContext.get("toolsPrincipal") as Record<string, unknown> | undefined;
    const ownerAddress = normalizeSubjectWallet(raw?.ownerAddress);
    const agentKey = asString(raw?.agentKey);
    if (!ownerAddress || !agentKey) {
      return null;
    }

    const rawScopes = Array.isArray(raw?.scopes)
      ? raw.scopes.filter((value): value is string => typeof value === "string")
      : [];
    const scope = asString(raw?.scope) ?? rawScopes.join(" ");
    const scopes = rawScopes.length > 0 ? rawScopes : splitScope(scope);
    const capabilities = deriveCliScopeCapabilities(scope);
    const hasToolsRead = asBoolean(raw?.hasToolsRead) ?? scopes.includes("tools:read");
    const hasToolsWrite = asBoolean(raw?.hasToolsWrite) ?? capabilities.hasToolsWrite;
    const hasWalletExecute = asBoolean(raw?.hasWalletExecute) ?? capabilities.hasWalletExecute;
    const hasAnyWriteScope =
      asBoolean(raw?.hasAnyWriteScope) ?? capabilities.hasAnyWriteScope;

    return {
      sessionId: asString(raw?.sessionId) ?? "",
      ownerAddress,
      agentKey,
      scope,
      scopes,
      hasToolsRead,
      hasToolsWrite,
      hasWalletExecute,
      hasAnyWriteScope,
    };
  } catch {
    return null;
  }
}

export function resolveSubjectWalletFromContext(options?: {
  allowUserFallback?: boolean;
}): SubjectWallet | null {
  const toolsPrincipal = getToolsPrincipal();
  if (toolsPrincipal) {
    return toolsPrincipal.ownerAddress;
  }

  if (hasToolsPrincipalContext()) {
    return null;
  }

  if (!options?.allowUserFallback) {
    return null;
  }

  const chatUserPrincipal = getChatUserPrincipal();
  if (!chatUserPrincipal) {
    return null;
  }

  return chatUserPrincipal.address;
}
