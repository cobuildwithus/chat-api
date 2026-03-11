import {
  verifyCliBearerAuth,
} from "@cobuild/wire";
import { verifyCliAccessToken } from "../oauth/jwt";
import {
  createToolsPrincipal,
  type ToolsPrincipal,
} from "../auth/principals";
import { readActiveCliSession } from "../oauth/store";

export async function authenticateToolsBearerToken(
  rawToken: string,
): Promise<ToolsPrincipal | null> {
  const result = await verifyCliBearerAuth({
    rawToken,
    verifyAccessToken: verifyCliAccessToken,
    readActiveSession: async (principal) =>
      await readActiveCliSession({
        sessionId: principal.sessionId,
        ownerAddress: principal.ownerAddress,
        agentKey: principal.agentKey,
      }),
  });
  if (!result.ok) {
    return null;
  }

  return createToolsPrincipal(result.principal);
}
