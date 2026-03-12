import { z } from "zod";
import {
  DEFAULT_CLI_JWT_AUDIENCE,
  DEFAULT_CLI_JWT_ISSUER,
  DEFAULT_DEV_CLI_JWT_PUBLIC_KEY,
} from "@cobuild/wire";

const replicaUrlsSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return undefined;
    const urls = value
      .split(",")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);
    return urls.length > 0 ? urls : undefined;
  },
  z.array(z.string().min(1)).optional(),
);

const numberFromEnv = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
};

const optionalPositiveIntSchema = z.preprocess(
  numberFromEnv,
  z.number().int().positive().optional(),
);

const optionalNonNegativeIntSchema = z.preprocess(
  numberFromEnv,
  z.number().int().nonnegative().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]),
  OPENAI_API_KEY: z.string().min(1),
  REDIS_URL: z.string().min(1),
  POSTGRES_URL: z.string().min(1),
  POSTGRES_REPLICA_URLS: replicaUrlsSchema,
  POSTGRES_POOL_MAX: optionalPositiveIntSchema,
  POSTGRES_POOL_IDLE_TIMEOUT_MS: optionalNonNegativeIntSchema,
  POSTGRES_POOL_CONNECTION_TIMEOUT_MS: optionalNonNegativeIntSchema,
  POSTGRES_POOL_STATS_INTERVAL_MS: optionalNonNegativeIntSchema,
  RATE_LIMIT_ENABLED: z.string().min(1).optional(),
  RATE_LIMIT_MAX: optionalPositiveIntSchema,
  RATE_LIMIT_WINDOW_MS: optionalPositiveIntSchema,
  OPENAI_REQUEST_TIMEOUT_MS: optionalPositiveIntSchema,
  COBUILD_AI_CONTEXT_TIMEOUT_MS: optionalPositiveIntSchema,
  PRIVY_APP_ID: z.string().min(1).optional(),
  PRIVY_VERIFICATION_KEY: z.string().min(1).optional(),
  DOCS_VECTOR_STORE_ID: z.string().min(1).optional(),
  DEBUG_CHAT: z.string().min(1).optional(),
  DEBUG_HTTP: z.string().min(1).optional(),
  CHAT_ALLOWED_ORIGINS: z.string().min(1).optional(),
  CHAT_TRUST_PROXY: z.string().min(1).optional(),
  SELF_HOSTED_MODE: z.string().min(1).optional(),
  SELF_HOSTED_PRODUCTION_ENABLED: z.string().min(1).optional(),
  SELF_HOSTED_DEFAULT_ADDRESS: z.string().min(1).optional(),
  SELF_HOSTED_SHARED_SECRET: z.string().min(1).optional(),
  CLI_TOKEN_PEPPER: z.string().min(1).optional(),
  CLI_JWT_PRIVATE_KEY: z.string().min(1).optional(),
  CLI_JWT_PUBLIC_KEY: z.string().min(1).optional(),
  CLI_JWT_ISSUER: z.string().min(1).optional(),
  CLI_JWT_AUDIENCE: z.string().min(1).optional(),
  CLI_ALLOW_DEV_KEYS: z.string().min(1).optional(),
});

const envCacheSchema = envSchema
  .extend({
    // Getter code treats non-production uniformly; tests often run with NODE_ENV=test.
    NODE_ENV: z.string().optional(),
  })
  .partial();

export type Env = z.infer<typeof envCacheSchema>;
export type ValidatedEnv = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;
let cachedEnvKey: string | null = null;
let hasWarnedSelfHostedProduction = false;
const cacheKeys = Object.keys(envSchema.shape) as (keyof Env)[];

function getEnvKey(source: NodeJS.ProcessEnv): string {
  return cacheKeys
    .map((key) => `${String(key)}=${source[String(key)] ?? "__undefined__"}`)
    .join("\u0000");
}

function setCachedEnv(env: Env, envKey = getEnvKey(process.env)): Env {
  cachedEnv = env;
  cachedEnvKey = envKey;
  return env;
}

export function getEnv(): Env {
  const currentEnvKey = getEnvKey(process.env);
  if (!cachedEnv || cachedEnvKey !== currentEnvKey) {
    return setCachedEnv(envCacheSchema.parse(process.env), currentEnvKey);
  }
  return cachedEnv;
}

export function resetEnvCacheForTests(): void {
  cachedEnv = null;
  cachedEnvKey = null;
  hasWarnedSelfHostedProduction = false;
}

const DEFAULT_DEV_CLI_JWT_PRIVATE_KEY = [
  "-----BEGIN PRIVATE KEY-----",
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgXeejR7RjCYJB0drU",
  "9BOiYSmdA5NNri/Pt+sYzGoE5kihRANCAAQl7PV/QsF4LlUl81QTu/dsTCTv0k6K",
  "0kwqxsGA8QaMSyAoqeMdx5yJqudE3BWXBKPtfHuPyAhQp0H6CuHOnmM1",
  "-----END PRIVATE KEY-----",
].join("\n");

function allowDevCliKeyFallback(env: {
  NODE_ENV?: string;
  CLI_ALLOW_DEV_KEYS?: string;
}): boolean {
  if (env.NODE_ENV === "production") {
    return false;
  }
  if (process.env.VITEST === "true") {
    return true;
  }
  return isTruthy(env.CLI_ALLOW_DEV_KEYS?.toLowerCase());
}

function isSelfHostedModeEnabled(env: {
  SELF_HOSTED_MODE?: string;
}): boolean {
  return isTruthy(env.SELF_HOSTED_MODE?.toLowerCase());
}

function isSelfHostedProductionOptInEnabled(env: {
  SELF_HOSTED_PRODUCTION_ENABLED?: string;
}): boolean {
  return isTruthy(env.SELF_HOSTED_PRODUCTION_ENABLED?.toLowerCase());
}

function warnIfSelfHostedProductionEnabled(env: {
  NODE_ENV?: string;
  SELF_HOSTED_MODE?: string;
  SELF_HOSTED_PRODUCTION_ENABLED?: string;
}): void {
  if (env.NODE_ENV !== "production") {
    return;
  }
  if (!isSelfHostedModeEnabled(env) || !isSelfHostedProductionOptInEnabled(env)) {
    return;
  }
  if (hasWarnedSelfHostedProduction || process.env.NODE_ENV === "test") {
    return;
  }

  hasWarnedSelfHostedProduction = true;
  console.warn(
    "[auth] SELF_HOSTED_MODE is enabled in production. This bypasses Privy and should only run behind your own trusted access controls.",
  );
}

export function validateEnvVariables(): ValidatedEnv {
  const env = envSchema.parse(process.env);
  setCachedEnv(env);
  const selfHosted = isSelfHostedModeEnabled(env);
  if (
    selfHosted &&
    env.NODE_ENV === "production" &&
    !isSelfHostedProductionOptInEnabled(env)
  ) {
    throw new Error(
      "Refusing production SELF_HOSTED_MODE without SELF_HOSTED_PRODUCTION_ENABLED=1",
    );
  }
  if (selfHosted && !env.SELF_HOSTED_SHARED_SECRET) {
    throw new Error("Missing required env in self-hosted mode: SELF_HOSTED_SHARED_SECRET");
  }
  if (!selfHosted && !env.PRIVY_APP_ID) {
    throw new Error("Missing required env: PRIVY_APP_ID");
  }
  if (!selfHosted && env.NODE_ENV === "production" && !env.PRIVY_VERIFICATION_KEY) {
    throw new Error("Missing required env in production: PRIVY_VERIFICATION_KEY");
  }
  if (env.NODE_ENV === "production" && !env.CLI_TOKEN_PEPPER) {
    throw new Error("Missing required env in production: CLI_TOKEN_PEPPER");
  }
  if (!env.CLI_JWT_PRIVATE_KEY && !allowDevCliKeyFallback(env)) {
    if (env.NODE_ENV === "production") {
      throw new Error("Missing required env in production: CLI_JWT_PRIVATE_KEY");
    }
    throw new Error(
      "Missing CLI_JWT_PRIVATE_KEY. Configure CLI JWT keys or set CLI_ALLOW_DEV_KEYS=1 for local development only.",
    );
  }
  if (!env.CLI_JWT_PUBLIC_KEY && !allowDevCliKeyFallback(env)) {
    if (env.NODE_ENV === "production") {
      throw new Error("Missing required env in production: CLI_JWT_PUBLIC_KEY");
    }
    throw new Error(
      "Missing CLI_JWT_PUBLIC_KEY. Configure CLI JWT keys or set CLI_ALLOW_DEV_KEYS=1 for local development only.",
    );
  }
  if (env.NODE_ENV === "production" && !env.CLI_JWT_ISSUER) {
    throw new Error("Missing required env in production: CLI_JWT_ISSUER");
  }
  if (env.NODE_ENV === "production" && !env.CLI_JWT_AUDIENCE) {
    throw new Error("Missing required env in production: CLI_JWT_AUDIENCE");
  }
  warnIfSelfHostedProductionEnabled(env);
  return env;
}

export type DatabaseConfig = {
  primaryUrl: string;
  replicaUrls: string[];
};

export type PostgresPoolOptions = {
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
};

const DEFAULT_RATE_LIMIT_MAX = 30;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_OPENAI_TIMEOUT_MS = 30_000;
const DEFAULT_COBUILD_AI_CONTEXT_TIMEOUT_MS = 7_000;

export function loadDatabaseConfig(): DatabaseConfig {
  const env = validateEnvVariables();
  return {
    primaryUrl: env.POSTGRES_URL,
    replicaUrls: env.POSTGRES_REPLICA_URLS ?? [],
  };
}

export function getPostgresPoolOptions(): PostgresPoolOptions {
  const env = getEnv();
  const options: PostgresPoolOptions = {};
  if (env.POSTGRES_POOL_MAX !== undefined) options.max = env.POSTGRES_POOL_MAX;
  if (env.POSTGRES_POOL_IDLE_TIMEOUT_MS !== undefined) {
    options.idleTimeoutMillis = env.POSTGRES_POOL_IDLE_TIMEOUT_MS;
  }
  if (env.POSTGRES_POOL_CONNECTION_TIMEOUT_MS !== undefined) {
    options.connectionTimeoutMillis = env.POSTGRES_POOL_CONNECTION_TIMEOUT_MS;
  }
  return options;
}

export function getPostgresPoolStatsIntervalMs(): number | null {
  const env = getEnv();
  return env.POSTGRES_POOL_STATS_INTERVAL_MS ?? null;
}

export function getRateLimitConfig(): {
  enabled: boolean;
  max: number;
  windowMs: number;
} {
  const env = getEnv();
  const isProduction = env.NODE_ENV === "production";
  const enabled =
    env.RATE_LIMIT_ENABLED === undefined
      ? isProduction
      : isTruthy(env.RATE_LIMIT_ENABLED);
  return {
    enabled,
    max: env.RATE_LIMIT_MAX ?? DEFAULT_RATE_LIMIT_MAX,
    windowMs: env.RATE_LIMIT_WINDOW_MS ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
  };
}

export function getOpenAiTimeoutMs(): number {
  const env = getEnv();
  return env.OPENAI_REQUEST_TIMEOUT_MS ?? DEFAULT_OPENAI_TIMEOUT_MS;
}

export function getCobuildAiContextTimeoutMs(): number {
  const env = getEnv();
  return env.COBUILD_AI_CONTEXT_TIMEOUT_MS ?? DEFAULT_COBUILD_AI_CONTEXT_TIMEOUT_MS;
}

export function getPrivyAppId(): string {
  const appId = getEnv().PRIVY_APP_ID;
  if (!appId) {
    throw new Error("Missing PRIVY_APP_ID");
  }
  return appId;
}

export function getPrivyVerificationKey(): string | null {
  const env = getEnv();
  const key = env.PRIVY_VERIFICATION_KEY;
  if (!key && env.NODE_ENV === "production" && !isTruthy(env.SELF_HOSTED_MODE?.toLowerCase())) {
    throw new Error("Missing required env in production: PRIVY_VERIFICATION_KEY");
  }
  return key ?? null;
}

export function isChatDebugEnabled(): boolean {
  const flag = getEnv().DEBUG_CHAT?.toLowerCase();
  return flag === "true" || flag === "1";
}

export function isSelfHostedMode(): boolean {
  return isSelfHostedModeEnabled(getEnv());
}

export function isSelfHostedModeAllowedAtRuntime(): boolean {
  const env = getEnv();
  return !(
    isSelfHostedModeEnabled(env) &&
    env.NODE_ENV === "production" &&
    !isSelfHostedProductionOptInEnabled(env)
  );
}

export function getSelfHostedDefaultAddress(): string | null {
  return getEnv().SELF_HOSTED_DEFAULT_ADDRESS ?? null;
}

export function getSelfHostedSharedSecret(): string | null {
  return getEnv().SELF_HOSTED_SHARED_SECRET ?? null;
}

export function isTrustedProxyConfigured(): boolean {
  const raw = getEnv().CHAT_TRUST_PROXY?.trim();
  if (!raw) {
    return false;
  }

  const normalized = raw.toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "no";
}

export function getCliJwtPrivateKey(): string {
  const env = getEnv();
  const configured = env.CLI_JWT_PRIVATE_KEY?.trim();
  if (configured) {
    return configured;
  }
  if (!allowDevCliKeyFallback(env)) {
    if (env.NODE_ENV === "production") {
      throw new Error("Missing required env in production: CLI_JWT_PRIVATE_KEY");
    }
    throw new Error(
      "Missing CLI_JWT_PRIVATE_KEY. Configure CLI JWT keys or set CLI_ALLOW_DEV_KEYS=1 for local development only.",
    );
  }
  return DEFAULT_DEV_CLI_JWT_PRIVATE_KEY;
}

export function getCliJwtPublicKey(): string {
  const env = getEnv();
  const configured = env.CLI_JWT_PUBLIC_KEY?.trim();
  if (configured) {
    return configured;
  }
  if (!allowDevCliKeyFallback(env)) {
    if (env.NODE_ENV === "production") {
      throw new Error("Missing required env in production: CLI_JWT_PUBLIC_KEY");
    }
    throw new Error(
      "Missing CLI_JWT_PUBLIC_KEY. Configure CLI JWT keys or set CLI_ALLOW_DEV_KEYS=1 for local development only.",
    );
  }
  return DEFAULT_DEV_CLI_JWT_PUBLIC_KEY;
}

export function getCliJwtIssuer(): string {
  const env = getEnv();
  const configured = env.CLI_JWT_ISSUER?.trim();
  if (configured) {
    return configured;
  }
  return DEFAULT_CLI_JWT_ISSUER;
}

export function getCliJwtAudience(): string {
  const env = getEnv();
  const configured = env.CLI_JWT_AUDIENCE?.trim();
  if (configured) {
    return configured;
  }
  return DEFAULT_CLI_JWT_AUDIENCE;
}

function isTruthy(value?: string | null): boolean {
  if (!value) return false;
  return value === "1" || value === "true" || value === "yes";
}

export { replicaUrlsSchema };
