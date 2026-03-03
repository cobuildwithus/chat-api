import { createHmac, randomBytes } from "node:crypto";
import {
  CLI_OAUTH_PUBLIC_CLIENT_ID,
  CLI_OAUTH_REDIRECT_PATH,
  deriveS256CodeChallenge as deriveS256CodeChallengeFromWire,
  hasAnyWriteCapability,
  normalizeCliSessionLabel as normalizeWireCliSessionLabel,
  validateCliRedirectUri as validateWireCliRedirectUri,
  validatePkceCodeChallenge as validateWirePkceCodeChallenge,
  validatePkceCodeVerifier as validateWirePkceCodeVerifier,
  verifyPkceS256 as verifyPkceS256FromWire,
} from "@cobuild/wire";

const DEFAULT_DEV_TOKEN_PEPPER = "dev-build-bot-token-pepper";

export const OAUTH_AUTH_CODE_TTL_MS = 5 * 60_000;
export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
export const OAUTH_REFRESH_TOKEN_TTL_READ_ONLY_MS = 90 * 24 * 60 * 60_000;
export const OAUTH_REFRESH_TOKEN_TTL_WRITE_MS = 30 * 24 * 60 * 60_000;
export { CLI_OAUTH_PUBLIC_CLIENT_ID, CLI_OAUTH_REDIRECT_PATH };

function getBuildBotTokenPepper(): string {
  const configured = process.env.BUILD_BOT_TOKEN_PEPPER?.trim();
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing BUILD_BOT_TOKEN_PEPPER");
  }

  return DEFAULT_DEV_TOKEN_PEPPER;
}

export function digestOAuthSecret(rawSecret: string): string {
  return createHmac("sha256", getBuildBotTokenPepper()).update(rawSecret).digest("hex");
}

export function createOAuthSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function createAuthCode(): string {
  return createOAuthSecret(32);
}

export function createRefreshToken(): string {
  return `rfr_${createOAuthSecret(48)}`;
}

export function getCliRefreshTokenTtlMs(scope: string): number {
  const hasWriteScope = hasAnyWriteCapability(scope);
  return hasWriteScope
    ? OAUTH_REFRESH_TOKEN_TTL_WRITE_MS
    : OAUTH_REFRESH_TOKEN_TTL_READ_ONLY_MS;
}

export function validateCliSessionLabel(rawLabel: string | undefined): string | undefined {
  return normalizeWireCliSessionLabel(rawLabel);
}

export function validatePkceCodeChallenge(value: string): string {
  return validateWirePkceCodeChallenge(value);
}

export function validatePkceCodeVerifier(value: string): string {
  return validateWirePkceCodeVerifier(value);
}

export async function deriveS256CodeChallenge(codeVerifier: string): Promise<string> {
  return await deriveS256CodeChallengeFromWire(codeVerifier);
}

export async function verifyPkceS256(params: {
  codeVerifier: string;
  codeChallenge: string;
}): Promise<boolean> {
  return await verifyPkceS256FromWire(params);
}

export function validateCliRedirectUri(rawRedirectUri: string): string {
  return validateWireCliRedirectUri(rawRedirectUri);
}
