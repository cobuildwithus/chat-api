import { afterEach, describe, expect, it } from "vitest";
import {
  createAuthCode,
  createOAuthSecret,
  createRefreshToken,
  deriveS256CodeChallenge,
  digestOAuthSecret,
  getCliRefreshTokenTtlMs,
  OAUTH_REFRESH_TOKEN_TTL_READ_ONLY_MS,
  OAUTH_REFRESH_TOKEN_TTL_WRITE_MS,
  validateCliSessionLabel,
  validateCliRedirectUri,
  validatePkceCodeChallenge,
  validatePkceCodeVerifier,
  verifyPkceS256,
} from "../../../src/api/oauth/security";

describe("oauth security helpers", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("digests oauth secrets with configured pepper", () => {
    process.env = {
      ...originalEnv,
      CLI_TOKEN_PEPPER: "pepper-1",
      NODE_ENV: "development",
    };
    const digestA = digestOAuthSecret("secret");
    const digestB = digestOAuthSecret("secret");
    const digestC = digestOAuthSecret("secret-2");

    expect(digestA).toBe(digestB);
    expect(digestA).not.toBe(digestC);
    expect(digestA).toMatch(/^[a-f0-9]{64}$/);
  });

  it("requires token pepper in production", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
    };
    delete process.env.CLI_TOKEN_PEPPER;
    expect(() => digestOAuthSecret("secret")).toThrow("Missing CLI_TOKEN_PEPPER");
  });

  it("creates random oauth secrets/codes/tokens", () => {
    expect(createOAuthSecret()).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(createAuthCode()).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(createRefreshToken()).toMatch(/^rfr_[A-Za-z0-9_-]+$/);
  });

  it("validates PKCE verifier/challenge and S256 pairing", async () => {
    const verifier = "A".repeat(43);
    const challenge = await deriveS256CodeChallenge(verifier);
    expect(validatePkceCodeVerifier(verifier)).toBe(verifier);
    expect(validatePkceCodeChallenge(challenge)).toBe(challenge);
    await expect(verifyPkceS256({ codeVerifier: verifier, codeChallenge: challenge })).resolves.toBe(
      true
    );
    await expect(
      verifyPkceS256({
        codeVerifier: verifier,
        codeChallenge: "B".repeat(43),
      })
    ).resolves.toBe(false);
    expect(() => validatePkceCodeVerifier("bad")).toThrow(
      "code_verifier must meet PKCE RFC7636 requirements"
    );
    expect(() => validatePkceCodeChallenge("bad")).toThrow(
      "code_challenge must be a valid base64url PKCE challenge"
    );
  });

  it("strictly validates loopback redirect URIs", () => {
    expect(validateCliRedirectUri("http://127.0.0.1:43111/auth/callback")).toBe(
      "http://127.0.0.1:43111/auth/callback"
    );
    expect(validateCliRedirectUri("http://localhost:43111/auth/callback")).toBe(
      "http://localhost:43111/auth/callback"
    );
    expect(() => validateCliRedirectUri("https://127.0.0.1:43111/auth/callback")).toThrow(
      "redirect_uri must use http loopback transport"
    );
    expect(() => validateCliRedirectUri("http://example.com:43111/auth/callback")).toThrow(
      "redirect_uri must use a loopback host"
    );
    expect(() => validateCliRedirectUri("http://127.0.0.1/auth/callback")).toThrow(
      "redirect_uri must include an explicit port"
    );
    expect(() => validateCliRedirectUri("http://127.0.0.1:43111/auth/callback?q=1")).toThrow(
      "redirect_uri must not include query params or fragments"
    );
    expect(() => validateCliRedirectUri("http://127.0.0.1:43111/not-callback")).toThrow(
      "redirect_uri path must be /auth/callback"
    );
  });

  it("derives refresh token ttl from granted scope", () => {
    expect(getCliRefreshTokenTtlMs("tools:read wallet:read offline_access")).toBe(
      OAUTH_REFRESH_TOKEN_TTL_READ_ONLY_MS
    );
    expect(getCliRefreshTokenTtlMs("tools:read wallet:execute offline_access")).toBe(
      OAUTH_REFRESH_TOKEN_TTL_WRITE_MS
    );
    expect(getCliRefreshTokenTtlMs("tools:write wallet:read offline_access")).toBe(
      OAUTH_REFRESH_TOKEN_TTL_WRITE_MS
    );
  });

  it("validates and normalizes cli session labels", () => {
    expect(validateCliSessionLabel("  Laptop   (Main)  ")).toBe("Laptop (Main)");
    expect(validateCliSessionLabel("   ")).toBeUndefined();
    expect(() => validateCliSessionLabel("<script>alert(1)</script>")).toThrow(
      "label contains unsupported characters"
    );
  });
});
