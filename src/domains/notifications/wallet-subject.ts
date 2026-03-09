import { requestContext } from "@fastify/request-context";
import { normalizeAddress } from "../../chat/address";

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type ToolsPrincipalContext = {
  ownerAddress: string;
  agentKey: string;
  scopes: string[];
};

function getRawToolsPrincipalFromContext(): Record<string, unknown> | undefined {
  try {
    return requestContext.get("toolsPrincipal") as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

export function getToolsPrincipalFromContext(): ToolsPrincipalContext | null {
  const raw = getRawToolsPrincipalFromContext();
  const ownerAddress = normalizeAddress(raw?.ownerAddress);
  const agentKey = asString(raw?.agentKey);
  if (!ownerAddress || !agentKey) {
    return null;
  }
  const scopes = Array.isArray(raw?.scopes)
    ? raw.scopes.filter((value): value is string => typeof value === "string")
    : [];
  return {
    ownerAddress,
    agentKey,
    scopes,
  };
}

export function resolveSubjectWalletFromContext(options?: {
  allowUserFallback?: boolean;
}): string | null {
  const toolsPrincipal = getToolsPrincipalFromContext();
  if (toolsPrincipal) {
    return toolsPrincipal.ownerAddress;
  }

  if (getRawToolsPrincipalFromContext()) {
    return null;
  }

  if (!options?.allowUserFallback) {
    return null;
  }

  try {
    const user = requestContext.get("user") as Record<string, unknown> | undefined;
    return normalizeAddress(user?.address);
  } catch {
    return null;
  }
}
