import {
  hasAnyWriteCapability,
  hasToolsWrite,
  hasWalletExecute,
  splitScope,
} from "@cobuild/wire";
import { normalizeAddress } from "../../chat/address";
import { verifyCliAccessToken } from "../oauth/jwt";

export async function authenticateToolsBearerToken(rawToken: string): Promise<{
  sessionId: string;
  ownerAddress: `0x${string}`;
  agentKey: string;
  scope: string;
  scopes: string[];
  hasToolsRead: boolean;
  hasToolsWrite: boolean;
  hasWalletExecute: boolean;
  hasAnyWriteScope: boolean;
} | null> {
  const claims = await verifyCliAccessToken(rawToken);
  if (!claims) {
    return null;
  }

  const ownerAddress = normalizeAddress(claims.sub);
  if (!ownerAddress) {
    return null;
  }

  const agentKey = claims.agentKey.trim();
  if (!agentKey) {
    return null;
  }

  const scope = claims.scope.trim();
  if (!scope) {
    return null;
  }

  const scopes = splitScope(scope);
  const hasToolsRead = scopes.includes("tools:read");
  const hasToolsWriteScope = hasToolsWrite(scope);
  const hasWalletExecuteScope = hasWalletExecute(scope);

  return {
    sessionId: claims.sid,
    ownerAddress: ownerAddress as `0x${string}`,
    agentKey,
    scope,
    scopes,
    hasToolsRead,
    hasToolsWrite: hasToolsWriteScope,
    hasWalletExecute: hasWalletExecuteScope,
    hasAnyWriteScope: hasAnyWriteCapability(scope),
  };
}
