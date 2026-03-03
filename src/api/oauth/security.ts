import { createHash, createHmac, randomBytes } from "node:crypto";

const DEFAULT_DEV_TOKEN_PEPPER = "dev-build-bot-token-pepper";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const PKCE_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export const OAUTH_AUTH_CODE_TTL_MS = 5 * 60_000;
export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
export const OAUTH_REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60_000;
export const OAUTH_PUBLIC_CLIENT_ID = "buildbot_cli";
export const OAUTH_REDIRECT_PATH = "/auth/callback";

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

export function validatePkceCodeChallenge(value: string): string {
  const trimmed = value.trim();
  if (!PKCE_CHALLENGE_PATTERN.test(trimmed)) {
    throw new Error("code_challenge must be a valid base64url PKCE challenge");
  }
  return trimmed;
}

export function validatePkceCodeVerifier(value: string): string {
  const trimmed = value.trim();
  if (!PKCE_PATTERN.test(trimmed)) {
    throw new Error("code_verifier must meet PKCE RFC7636 requirements");
  }
  return trimmed;
}

export function deriveS256CodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function verifyPkceS256(params: {
  codeVerifier: string;
  codeChallenge: string;
}): boolean {
  const verifier = validatePkceCodeVerifier(params.codeVerifier);
  const expectedChallenge = deriveS256CodeChallenge(verifier);
  return expectedChallenge === params.codeChallenge;
}

export function validateCliRedirectUri(rawRedirectUri: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawRedirectUri);
  } catch {
    throw new Error("redirect_uri must be an absolute URL");
  }

  if (parsed.protocol !== "http:") {
    throw new Error("redirect_uri must use http loopback transport");
  }
  if (parsed.username || parsed.password) {
    throw new Error("redirect_uri must not include credentials");
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("redirect_uri must use a loopback host");
  }
  if (!parsed.port) {
    throw new Error("redirect_uri must include an explicit port");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("redirect_uri must not include query params or fragments");
  }
  if (parsed.pathname !== OAUTH_REDIRECT_PATH) {
    throw new Error(`redirect_uri path must be ${OAUTH_REDIRECT_PATH}`);
  }

  return parsed.toString();
}
