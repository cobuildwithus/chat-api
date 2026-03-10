import {
  deriveCliScopeCapabilities,
  splitScope,
} from "@cobuild/wire";
import { verifyCliAccessToken } from "../oauth/jwt";
import {
  createToolsPrincipal,
  normalizeSubjectWallet,
  type ToolsPrincipal,
} from "../auth/principals";

export async function authenticateToolsBearerToken(
  rawToken: string,
): Promise<ToolsPrincipal | null> {
  const claims = await verifyCliAccessToken(rawToken);
  if (!claims) {
    return null;
  }

  const ownerAddress = normalizeSubjectWallet(claims.sub);
  const scope = claims.scope.trim();
  const agentKey = claims.agentKey.trim();
  if (!ownerAddress || !scope || !agentKey) {
    return null;
  }

  const scopes = splitScope(scope);
  const capabilities = deriveCliScopeCapabilities(scope);

  return createToolsPrincipal({
    sessionId: claims.sid,
    ownerAddress,
    agentKey,
    scope,
    scopes,
    hasToolsRead: scopes.includes("tools:read"),
    hasToolsWrite: capabilities.hasToolsWrite,
    hasWalletExecute: capabilities.hasWalletExecute,
    hasAnyWriteScope: capabilities.hasAnyWriteScope,
  });
}
