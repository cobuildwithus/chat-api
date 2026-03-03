import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { normalizeAddress } from "../../chat/address";
import { cobuildPrimaryDb } from "../../infra/db/cobuildDb";
import { cliOauthCodes, cliSessions } from "../../infra/db/schema";
import {
  OAUTH_AUTH_CODE_TTL_MS,
  OAUTH_REFRESH_TOKEN_TTL_MS,
  createAuthCode,
  createRefreshToken,
  digestOAuthSecret,
} from "./security";

export type CliSessionView = {
  id: string;
  agentKey: string;
  scope: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
};

export type ConsumedAuthorizationCode = {
  id: string;
  ownerAddress: `0x${string}`;
  agentKey: string;
  scope: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  label: string | null;
};

type OAuthCodeRow = {
  id: bigint;
  ownerAddress: string;
  agentKey: string;
  scope: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  label: string | null;
};

function normalizeOwnerAddressOrThrow(ownerAddress: string): `0x${string}` {
  const normalized = normalizeAddress(ownerAddress);
  if (!normalized) {
    throw new Error("Invalid owner address");
  }
  return normalized as `0x${string}`;
}

function parseSessionId(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function toCliSessionView(row: {
  id: bigint;
  agentKey: string;
  scope: string;
  label: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
}): CliSessionView {
  return {
    id: row.id.toString(),
    agentKey: row.agentKey,
    scope: row.scope,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function createAuthorizationCode(params: {
  ownerAddress: string;
  agentKey: string;
  scope: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  label?: string;
}): Promise<{ code: string; expiresAt: Date }> {
  const db = cobuildPrimaryDb();
  const code = createAuthCode();
  const codeHash = digestOAuthSecret(code);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_AUTH_CODE_TTL_MS);
  const ownerAddress = normalizeOwnerAddressOrThrow(params.ownerAddress);

  await db.insert(cliOauthCodes).values({
    codeHash,
    ownerAddress,
    agentKey: params.agentKey,
    scope: params.scope,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    label: params.label?.trim() || null,
    createdAt: now,
    expiresAt,
  });

  return { code, expiresAt };
}

function toConsumedAuthorizationCode(row: OAuthCodeRow): ConsumedAuthorizationCode {
  return {
    id: row.id.toString(),
    ownerAddress: normalizeOwnerAddressOrThrow(row.ownerAddress),
    agentKey: row.agentKey,
    scope: row.scope,
    redirectUri: row.redirectUri,
    codeChallenge: row.codeChallenge,
    codeChallengeMethod: row.codeChallengeMethod,
    label: row.label,
  };
}

export async function consumeAuthorizationCodeWithPkce(params: {
  rawCode: string;
  redirectUri: string;
  expectedCodeChallenge: string;
  codeChallengeMethod: "S256";
}): Promise<ConsumedAuthorizationCode | null> {
  const db = cobuildPrimaryDb();
  const codeHash = digestOAuthSecret(params.rawCode);
  const now = new Date();

  const [row] = await db
    .update(cliOauthCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(cliOauthCodes.codeHash, codeHash),
        isNull(cliOauthCodes.usedAt),
        gt(cliOauthCodes.expiresAt, now),
        eq(cliOauthCodes.redirectUri, params.redirectUri),
        eq(cliOauthCodes.codeChallengeMethod, params.codeChallengeMethod),
        eq(cliOauthCodes.codeChallenge, params.expectedCodeChallenge),
      ),
    )
    .returning({
      id: cliOauthCodes.id,
      ownerAddress: cliOauthCodes.ownerAddress,
      agentKey: cliOauthCodes.agentKey,
      scope: cliOauthCodes.scope,
      redirectUri: cliOauthCodes.redirectUri,
      codeChallenge: cliOauthCodes.codeChallenge,
      codeChallengeMethod: cliOauthCodes.codeChallengeMethod,
      label: cliOauthCodes.label,
    });

  if (!row) {
    return null;
  }

  return toConsumedAuthorizationCode(row);
}

export async function createCliSession(params: {
  ownerAddress: string;
  agentKey: string;
  scope: string;
  label?: string | null;
}): Promise<{ sessionId: string; refreshToken: string; expiresAt: Date }> {
  const db = cobuildPrimaryDb();
  const ownerAddress = normalizeOwnerAddressOrThrow(params.ownerAddress);
  const refreshToken = createRefreshToken();
  const refreshTokenHash = digestOAuthSecret(refreshToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_REFRESH_TOKEN_TTL_MS);

  const [session] = await db
    .insert(cliSessions)
    .values({
      ownerAddress,
      agentKey: params.agentKey,
      scope: params.scope,
      label: params.label?.trim() || null,
      refreshTokenHash,
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    })
    .returning({ id: cliSessions.id });

  if (!session) {
    throw new Error("Failed to create cli session");
  }

  return {
    sessionId: session.id.toString(),
    refreshToken,
    expiresAt,
  };
}

export async function rotateCliSessionByRefreshToken(refreshToken: string): Promise<{
  sessionId: string;
  ownerAddress: `0x${string}`;
  agentKey: string;
  scope: string;
  refreshToken: string;
  expiresAt: Date;
} | null> {
  const db = cobuildPrimaryDb();
  const currentHash = digestOAuthSecret(refreshToken);
  const nextRefreshToken = createRefreshToken();
  const nextRefreshTokenHash = digestOAuthSecret(nextRefreshToken);
  const now = new Date();

  const [row] = await db
    .update(cliSessions)
    .set({
      refreshTokenHash: nextRefreshTokenHash,
      lastUsedAt: now,
    })
    .where(
      and(
        eq(cliSessions.refreshTokenHash, currentHash),
        isNull(cliSessions.revokedAt),
        gt(cliSessions.expiresAt, now),
      ),
    )
    .returning({
      id: cliSessions.id,
      ownerAddress: cliSessions.ownerAddress,
      agentKey: cliSessions.agentKey,
      scope: cliSessions.scope,
      expiresAt: cliSessions.expiresAt,
    });

  if (!row) {
    return null;
  }

  return {
    sessionId: row.id.toString(),
    ownerAddress: normalizeOwnerAddressOrThrow(row.ownerAddress),
    agentKey: row.agentKey,
    scope: row.scope,
    refreshToken: nextRefreshToken,
    expiresAt: row.expiresAt,
  };
}

export async function listCliSessions(ownerAddress: string): Promise<CliSessionView[]> {
  const db = cobuildPrimaryDb();
  const normalizedOwner = normalizeOwnerAddressOrThrow(ownerAddress);
  const now = new Date();

  const rows = await db
    .select({
      id: cliSessions.id,
      agentKey: cliSessions.agentKey,
      scope: cliSessions.scope,
      label: cliSessions.label,
      createdAt: cliSessions.createdAt,
      lastUsedAt: cliSessions.lastUsedAt,
      expiresAt: cliSessions.expiresAt,
    })
    .from(cliSessions)
    .where(
      and(
        eq(cliSessions.ownerAddress, normalizedOwner),
        isNull(cliSessions.revokedAt),
        gt(cliSessions.expiresAt, now),
      ),
    )
    .orderBy(desc(cliSessions.createdAt));

  return rows.map(toCliSessionView);
}

export async function revokeCliSession(params: {
  ownerAddress: string;
  sessionId: string;
}): Promise<boolean> {
  const db = cobuildPrimaryDb();
  const normalizedOwner = normalizeOwnerAddressOrThrow(params.ownerAddress);
  const parsedSessionId = parseSessionId(params.sessionId);
  if (!parsedSessionId) return false;

  const rows = await db
    .update(cliSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(cliSessions.id, parsedSessionId),
        eq(cliSessions.ownerAddress, normalizedOwner),
        isNull(cliSessions.revokedAt),
      ),
    )
    .returning({ id: cliSessions.id });

  return rows.length > 0;
}
