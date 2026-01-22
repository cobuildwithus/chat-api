import { SignJWT, jwtVerify } from "jose";
import { getChatGrantSecret } from "../config/env";

const GRANT_ISSUER = "cobuild-chat";
const GRANT_AUDIENCE = "cobuild-chat";
const GRANT_TTL_SECONDS = 60 * 15;

export type ChatGrantPayload = {
  cid: string;
  perm: "send";
  sub: string;
};

function getGrantSecret() {
  return new TextEncoder().encode(getChatGrantSecret());
}

export async function signChatGrant(chatId: string, userAddress: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ cid: chatId, perm: "send" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userAddress.toLowerCase())
    .setIssuedAt(now)
    .setExpirationTime(now + GRANT_TTL_SECONDS)
    .setIssuer(GRANT_ISSUER)
    .setAudience(GRANT_AUDIENCE)
    .sign(getGrantSecret());
}

export async function verifyChatGrant(token: string): Promise<ChatGrantPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getGrantSecret(), {
      issuer: GRANT_ISSUER,
      audience: GRANT_AUDIENCE,
      algorithms: ["HS256"],
    });

    if (payload.perm !== "send") return null;
    if (typeof payload.cid !== "string") return null;
    if (typeof payload.sub !== "string") return null;

    return {
      cid: payload.cid,
      perm: "send",
      sub: payload.sub,
    };
  } catch {
    return null;
  }
}
