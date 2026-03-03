import { normalizeAddress } from "../../chat/address";
import { verifyCliAccessToken } from "../oauth/jwt";
import { splitScope } from "../oauth/scopes";

export async function authenticateToolsBearerToken(rawToken: string): Promise<{
  sessionId: string;
  ownerAddress: `0x${string}`;
  agentKey: string;
  scope: string;
  scopes: string[];
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
  const hasToolsWrite = scopes.includes("tools:write");
  const hasWalletExecute = scopes.includes("wallet:execute");

  return {
    sessionId: claims.sid,
    ownerAddress: ownerAddress as `0x${string}`,
    agentKey,
    scope,
    scopes,
    hasToolsWrite,
    hasWalletExecute,
    hasAnyWriteScope: hasToolsWrite || hasWalletExecute,
  };
}
