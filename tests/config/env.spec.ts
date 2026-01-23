import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getChatGrantSecret,
  getCobuildAiContextTimeoutMs,
  getNeynarTimeoutMs,
  getOpenAiTimeoutMs,
  getPostgresPoolOptions,
  getRateLimitConfig,
  getPrivyAppId,
  getPrivyVerificationKey,
  isChatDebugEnabled,
  loadDatabaseConfig,
  validateEnvVariables,
} from "../../src/config/env";

const baseEnv = {
  NODE_ENV: "development",
  OPENAI_API_KEY: "key",
  REDIS_URL: "redis://localhost",
  POSTGRES_URL: "postgres://localhost",
  PRIVY_APP_ID: "privy",
  CHAT_GRANT_SECRET: "secret",
  NEYNAR_API_KEY: "neynar",
};

describe("env helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("validates env variables in development", () => {
    process.env = { ...process.env, ...baseEnv };
    expect(validateEnvVariables().PRIVY_APP_ID).toBe("privy");
    expect(getChatGrantSecret()).toBe("secret");
    expect(getPrivyAppId()).toBe("privy");
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

  it("uses timeout defaults when not configured", () => {
    process.env = { ...process.env, ...baseEnv };
    delete process.env.OPENAI_REQUEST_TIMEOUT_MS;
    delete process.env.NEYNAR_REQUEST_TIMEOUT_MS;
    delete process.env.COBUILD_AI_CONTEXT_TIMEOUT_MS;
    expect(getOpenAiTimeoutMs()).toBe(30_000);
    expect(getNeynarTimeoutMs()).toBe(8_000);
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

  it("requires privy app id when not self-hosted", () => {
    process.env = { ...process.env, ...baseEnv };
    delete process.env.PRIVY_APP_ID;
    expect(() => validateEnvVariables()).toThrow("Missing required env: PRIVY_APP_ID");
  });

  it("allows missing privy config when self-hosted", () => {
    process.env = { ...process.env, ...baseEnv, SELF_HOSTED_MODE: "true" };
    delete process.env.PRIVY_APP_ID;
    delete process.env.PRIVY_VERIFICATION_KEY;
    expect(() => validateEnvVariables()).not.toThrow();
  });

  it("throws from getPrivyAppId when missing", () => {
    process.env = { ...process.env, ...baseEnv };
    delete process.env.PRIVY_APP_ID;
    expect(() => getPrivyAppId()).toThrow("Missing PRIVY_APP_ID");
  });
});
