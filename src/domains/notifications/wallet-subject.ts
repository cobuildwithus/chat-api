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
};

export function getToolsPrincipalFromContext(): ToolsPrincipalContext | null {
  try {
    const raw = requestContext.get("toolsPrincipal") as Record<string, unknown> | undefined;
    const ownerAddress = normalizeAddress(raw?.ownerAddress);
    const agentKey = asString(raw?.agentKey);
    if (!ownerAddress || !agentKey) {
      return null;
    }
    return {
      ownerAddress,
      agentKey,
    };
  } catch {
    return null;
  }
}

export function resolveSubjectWalletFromContext(): string | null {
  const toolsPrincipal = getToolsPrincipalFromContext();
  if (toolsPrincipal) {
    return toolsPrincipal.ownerAddress;
  }

  try {
    const user = requestContext.get("user") as Record<string, unknown> | undefined;
    return normalizeAddress(user?.address);
  } catch {
    return null;
  }
}
