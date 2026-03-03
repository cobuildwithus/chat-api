import * as jose from "jose";
import { randomUUID } from "node:crypto";
import {
  parseCliJwtVerifiedClaims,
  type CliAccessTokenClaims,
  type CliJwtVerifiedClaims,
} from "@cobuild/wire";
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

export type { CliAccessTokenClaims };

type VerifiedCliAccessTokenClaims = CliJwtVerifiedClaims;

async function getSigningKeys(): Promise<CachedKeys> {
  const privateKeyPem = getBuildBotJwtPrivateKey();
  const publicKeyPem = getBuildBotJwtPublicKey();

  if (
    cachedKeys &&
    cachedKeys.privateKeyPem === privateKeyPem &&
    cachedKeys.publicKeyPem === publicKeyPem
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
  return parseCliJwtVerifiedClaims(payload);
}

export async function verifyCliAccessToken(
  token: string
): Promise<VerifiedCliAccessTokenClaims | null> {
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
