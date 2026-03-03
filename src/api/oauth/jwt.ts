import * as jose from "jose";
import { randomUUID } from "node:crypto";
import {
  getBuildBotJwtAudience,
  getBuildBotJwtIssuer,
  getBuildBotJwtPrivateKey,
  getBuildBotJwtPublicKey,
} from "../../config/env";
import { OAUTH_ACCESS_TOKEN_TTL_SECONDS } from "./security";

type CachedKeys = {
  privateKeyPem: string;
  privateKey: jose.KeyLike;
  publicKeyPem: string;
  publicKey: jose.KeyLike;
};

let cachedKeys: CachedKeys | null = null;

export type CliAccessTokenClaims = {
  sub: string;
  sid: string;
  agentKey: string;
  scope: string;
};

type VerifiedCliAccessTokenClaims = CliAccessTokenClaims & {
  iat: number;
  exp: number;
  iss: string;
  aud: string | string[];
};

async function getSigningKeys(): Promise<CachedKeys> {
  const privateKeyPem = getBuildBotJwtPrivateKey();
  const publicKeyPem = getBuildBotJwtPublicKey();

  if (
    cachedKeys
    && cachedKeys.privateKeyPem === privateKeyPem
    && cachedKeys.publicKeyPem === publicKeyPem
  ) {
    return cachedKeys;
  }

  const normalizedPrivate = privateKeyPem.replace(/\\n/g, "\n").trim();
  const normalizedPublic = publicKeyPem.replace(/\\n/g, "\n").trim();

  const [privateKey, publicKey] = await Promise.all([
    jose.importPKCS8(normalizedPrivate, "ES256"),
    jose.importSPKI(normalizedPublic, "ES256"),
  ]);

  cachedKeys = {
    privateKeyPem,
    privateKey,
    publicKeyPem,
    publicKey,
  };
  return cachedKeys;
}

export async function signCliAccessToken(claims: CliAccessTokenClaims): Promise<string> {
  const { privateKey } = await getSigningKeys();
  const issuer = getBuildBotJwtIssuer();
  const audience = getBuildBotJwtAudience();

  return await new jose.SignJWT({
    sid: claims.sid,
    agent_key: claims.agentKey,
    scope: claims.scope,
  })
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_ACCESS_TOKEN_TTL_SECONDS}s`)
    .setJti(randomUUID())
    .sign(privateKey);
}

function parseClaims(payload: jose.JWTPayload): VerifiedCliAccessTokenClaims | null {
  if (
    typeof payload.sub !== "string"
    || typeof payload.sid !== "string"
    || typeof payload.agent_key !== "string"
    || typeof payload.scope !== "string"
    || typeof payload.iat !== "number"
    || typeof payload.exp !== "number"
    || typeof payload.iss !== "string"
    || (typeof payload.aud !== "string" && !Array.isArray(payload.aud))
  ) {
    return null;
  }

  return {
    sub: payload.sub,
    sid: payload.sid,
    agentKey: payload.agent_key,
    scope: payload.scope,
    iat: payload.iat,
    exp: payload.exp,
    iss: payload.iss,
    aud: payload.aud,
  };
}

export async function verifyCliAccessToken(token: string): Promise<VerifiedCliAccessTokenClaims | null> {
  const { publicKey } = await getSigningKeys();
  const issuer = getBuildBotJwtIssuer();
  const audience = getBuildBotJwtAudience();

  try {
    const { payload } = await jose.jwtVerify(token, publicKey, {
      algorithms: ["ES256"],
      issuer,
      audience,
    });
    return parseClaims(payload);
  } catch {
    return null;
  }
}
