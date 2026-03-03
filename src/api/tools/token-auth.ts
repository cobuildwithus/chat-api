import { normalizeAddress } from "../../chat/address";
import { verifyCliAccessToken } from "../oauth/jwt";
import { canWriteFromScope, splitScope } from "../oauth/scopes";

export async function authenticateToolsBearerToken(rawToken: string): Promise<{
  sessionId: string;
  ownerAddress: `0x${string}`;
  agentKey: string;
  scope: string;
  scopes: string[];
  canWrite: boolean;
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

  return {
    sessionId: claims.sid,
    ownerAddress: ownerAddress as `0x${string}`,
    agentKey,
    scope,
    scopes: splitScope(scope),
    canWrite: canWriteFromScope(scope),
  };
}
