import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getChatInternalServiceKey,
  getChatGrantSecret,
  getCliJwtAudience,
  getCliJwtIssuer,
  getCliJwtPrivateKey,
  getCliJwtPublicKey,
  getCobuildAiContextTimeoutMs,
  getOpenAiTimeoutMs,
  getPostgresPoolOptions,
  getPostgresPoolStatsIntervalMs,
  getRateLimitConfig,
  getPrivyAppId,
  getPrivyVerificationKey,
  isChatDebugEnabled,
  loadDatabaseConfig,
  resetEnvCacheForTests,
  validateEnvVariables,
} from "../../src/config/env";

const baseEnv = {
  NODE_ENV: "development",
  OPENAI_API_KEY: "key",
  REDIS_URL: "redis://localhost",
  POSTGRES_URL: "postgres://localhost",
  PRIVY_APP_ID: "privy",
  CHAT_GRANT_SECRET: "secret",
  CHAT_INTERNAL_SERVICE_KEY: "internal-secret",
  CLI_TOKEN_PEPPER: "pepper",
  CLI_JWT_PRIVATE_KEY: "private-key",
  CLI_JWT_PUBLIC_KEY: "public-key",
  CLI_JWT_ISSUER: "issuer",
  CLI_JWT_AUDIENCE: "audience",
};

describe("env helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetEnvCacheForTests();
  });

  afterEach(() => {
    resetEnvCacheForTests();
    process.env = originalEnv;
  });

  it("validates env variables in development", () => {
    process.env = { ...process.env, ...baseEnv };
    expect(validateEnvVariables().PRIVY_APP_ID).toBe("privy");
    expect(getChatGrantSecret()).toBe("secret");
    expect(getPrivyAppId()).toBe("privy");
    expect(getChatInternalServiceKey()).toBe("internal-secret");
    expect(getCliJwtPrivateKey()).toBe("private-key");
    expect(getCliJwtPublicKey()).toBe("public-key");
    expect(getCliJwtIssuer()).toBe("issuer");
    expect(getCliJwtAudience()).toBe("audience");
  });

  it("parses replica urls and debug flag", () => {
    process.env = {
      ...process.env,
      ...baseEnv,
      POSTGRES_REPLICA_URLS: "postgres://a, postgres://b",
      DEBUG_CHAT: "1",
    };

    const config = loadDatabaseConfig();
    expect(config.replicaUrls).toEqual(["postgres://a", "postgres://b"]);
    expect(isChatDebugEnabled()).toBe(true);
  });

  it("parses pool options and rate limit config", () => {
    process.env = {
      ...process.env,
      ...baseEnv,
      POSTGRES_POOL_MAX: "12",
      POSTGRES_POOL_IDLE_TIMEOUT_MS: "4000",
      POSTGRES_POOL_CONNECTION_TIMEOUT_MS: "2000",
      RATE_LIMIT_ENABLED: "true",
      RATE_LIMIT_MAX: "10",
      RATE_LIMIT_WINDOW_MS: "5000",
    };

    expect(getPostgresPoolOptions()).toEqual({
      max: 12,
      idleTimeoutMillis: 4000,
      connectionTimeoutMillis: 2000,
    });
    expect(getRateLimitConfig()).toEqual({
      enabled: true,
      max: 10,
      windowMs: 5000,
    });
  });

  it("uses defaults when optional pool and rate limit settings are missing", () => {
    process.env = { ...process.env, ...baseEnv, POSTGRES_POOL_MAX: " " };
    delete process.env.POSTGRES_POOL_IDLE_TIMEOUT_MS;
    delete process.env.POSTGRES_POOL_CONNECTION_TIMEOUT_MS;
    delete process.env.POSTGRES_POOL_STATS_INTERVAL_MS;
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;

    expect(getPostgresPoolOptions()).toEqual({});
    expect(getPostgresPoolStatsIntervalMs()).toBeNull();
    expect(getRateLimitConfig()).toEqual({
      enabled: false,
      max: 30,
      windowMs: 60_000,
    });
  });

  it("enables global rate limiting by default in production", () => {
    process.env = {
      ...process.env,
      ...baseEnv,
      NODE_ENV: "production",
      PRIVY_VERIFICATION_KEY: "verification-key",
    };
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;

    expect(getRateLimitConfig()).toEqual({
      enabled: true,
      max: 30,
      windowMs: 60_000,
    });
  });

  it("parses pool stats interval when configured", () => {
    process.env = { ...process.env, ...baseEnv, POSTGRES_POOL_STATS_INTERVAL_MS: "15000" };

    expect(getPostgresPoolStatsIntervalMs()).toBe(15000);
  });

  it("throws when numeric env values are invalid", () => {
    process.env = { ...process.env, ...baseEnv, POSTGRES_POOL_MAX: "not-a-number" };

    expect(() => getPostgresPoolOptions()).toThrow();
  });

  it("uses timeout defaults when not configured", () => {
    process.env = { ...process.env, ...baseEnv };
    delete process.env.OPENAI_REQUEST_TIMEOUT_MS;
    delete process.env.COBUILD_AI_CONTEXT_TIMEOUT_MS;
    expect(getOpenAiTimeoutMs()).toBe(30_000);
    expect(getCobuildAiContextTimeoutMs()).toBe(7_000);
  });

  it("handles missing privy verification key outside production", () => {
    process.env = { ...process.env, ...baseEnv, NODE_ENV: "development" };
    delete process.env.PRIVY_VERIFICATION_KEY;
    expect(getPrivyVerificationKey()).toBeNull();
  });

  it("requires privy verification key in production", () => {
    process.env = { ...process.env, ...baseEnv, NODE_ENV: "production" };
    delete process.env.PRIVY_VERIFICATION_KEY;
    expect(() => validateEnvVariables()).toThrow(
      "Missing required env in production: PRIVY_VERIFICATION_KEY",
    );
  });

  it("does not require chat internal service key in production", () => {
    process.env = {
      ...process.env,
      ...baseEnv,
      NODE_ENV: "production",
      PRIVY_VERIFICATION_KEY: "verification-key",
    };
    delete process.env.CHAT_INTERNAL_SERVICE_KEY;
    delete process.env.CLI_TOOLS_INTERNAL_KEY;
    expect(() => validateEnvVariables()).not.toThrow();
  });

  it("requires privy app id when not self-hosted", () => {
    process.env = { ...process.env, ...baseEnv };
    delete process.env.PRIVY_APP_ID;
    expect(() => validateEnvVariables()).toThrow("Missing required env: PRIVY_APP_ID");
  });

  it("allows missing privy config when self-hosted", () => {
    process.env = {
      ...process.env,
      ...baseEnv,
      SELF_HOSTED_MODE: "true",
      SELF_HOSTED_SHARED_SECRET: "self-hosted-secret",
    };
    delete process.env.PRIVY_APP_ID;
    delete process.env.PRIVY_VERIFICATION_KEY;
    expect(() => validateEnvVariables()).not.toThrow();
  });

  it("requires self-hosted shared secret whenever self-hosted mode is enabled", () => {
    process.env = {
      ...process.env,
      ...baseEnv,
      SELF_HOSTED_MODE: "true",
      CHAT_INTERNAL_SERVICE_KEY: "internal-secret",
    };
    delete process.env.PRIVY_APP_ID;
    delete process.env.PRIVY_VERIFICATION_KEY;
    delete process.env.SELF_HOSTED_SHARED_SECRET;

    expect(() => validateEnvVariables()).toThrow(
      "Missing required env in self-hosted mode: SELF_HOSTED_SHARED_SECRET",
    );
  });

  it("requires JWT signing key env values outside production unless dev fallback is explicitly allowed", () => {
    process.env = {
      ...process.env,
      ...baseEnv,
      NODE_ENV: "development",
      PRIVY_VERIFICATION_KEY: "verification-key",
      VITEST: "false",
    };
    delete process.env.CLI_JWT_PRIVATE_KEY;
    delete process.env.CLI_JWT_PUBLIC_KEY;
    delete process.env.CLI_ALLOW_DEV_KEYS;

    expect(() => validateEnvVariables()).toThrow(
      "Missing CLI_JWT_PRIVATE_KEY. Configure CLI JWT keys or set CLI_ALLOW_DEV_KEYS=1 for local development only.",
    );

    process.env.CLI_ALLOW_DEV_KEYS = "1";
    expect(() => validateEnvVariables()).not.toThrow();
    expect(getCliJwtPrivateKey()).toContain("BEGIN PRIVATE KEY");
    expect(getCliJwtPublicKey()).toContain("BEGIN PUBLIC KEY");
  });

  it("requires token pepper in production", () => {
    process.env = {
      ...process.env,
      ...baseEnv,
      NODE_ENV: "production",
      PRIVY_VERIFICATION_KEY: "verification-key",
    };
    delete process.env.CLI_TOKEN_PEPPER;

    expect(() => validateEnvVariables()).toThrow(
      "Missing required env in production: CLI_TOKEN_PEPPER",
    );
  });

  it("requires JWT signing key env values in production", () => {
    process.env = {
      ...process.env,
      ...baseEnv,
      NODE_ENV: "production",
      PRIVY_VERIFICATION_KEY: "verification-key",
    };

    delete process.env.CLI_JWT_PRIVATE_KEY;
    expect(() => validateEnvVariables()).toThrow(
      "Missing required env in production: CLI_JWT_PRIVATE_KEY",
    );

    process.env.CLI_JWT_PRIVATE_KEY = "private-key";
    delete process.env.CLI_JWT_PUBLIC_KEY;
    expect(() => validateEnvVariables()).toThrow(
      "Missing required env in production: CLI_JWT_PUBLIC_KEY",
    );

    process.env.CLI_JWT_PUBLIC_KEY = "public-key";
    delete process.env.CLI_JWT_ISSUER;
    expect(() => validateEnvVariables()).toThrow(
      "Missing required env in production: CLI_JWT_ISSUER",
    );

    process.env.CLI_JWT_ISSUER = "issuer";
    delete process.env.CLI_JWT_AUDIENCE;
    expect(() => validateEnvVariables()).toThrow(
      "Missing required env in production: CLI_JWT_AUDIENCE",
    );
  });

  it("throws from getPrivyAppId when missing", () => {
    process.env = { ...process.env, ...baseEnv };
    delete process.env.PRIVY_APP_ID;
    expect(() => getPrivyAppId()).toThrow("Missing PRIVY_APP_ID");
  });

  it("returns null from getChatInternalServiceKey when missing", () => {
    process.env = { ...process.env, ...baseEnv };
    delete process.env.CHAT_INTERNAL_SERVICE_KEY;

    expect(getChatInternalServiceKey()).toBeNull();
  });

  it("falls back to legacy cli env key when new key is missing", () => {
    process.env = { ...process.env, ...baseEnv };
    delete process.env.CHAT_INTERNAL_SERVICE_KEY;
    process.env.CLI_TOOLS_INTERNAL_KEY = "legacy-secret";

    expect(getChatInternalServiceKey()).toBe("legacy-secret");
  });

  it("re-parses when process.env values change on the same object", () => {
    process.env = {
      ...process.env,
      ...baseEnv,
      RATE_LIMIT_ENABLED: "true",
      RATE_LIMIT_MAX: "10",
    };

    expect(getRateLimitConfig().max).toBe(10);
    process.env.RATE_LIMIT_MAX = "99";
    expect(getRateLimitConfig().max).toBe(99);
  });

  it("re-parses when process.env object reference changes", () => {
    process.env = {
      ...process.env,
      ...baseEnv,
      RATE_LIMIT_ENABLED: "true",
      RATE_LIMIT_MAX: "10",
    };
    expect(getRateLimitConfig().max).toBe(10);

    process.env = { ...process.env, RATE_LIMIT_MAX: "11" };
    expect(getRateLimitConfig().max).toBe(11);
  });
});
