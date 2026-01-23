import { z } from "zod";

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
  NEYNAR_REQUEST_TIMEOUT_MS: optionalPositiveIntSchema,
  COBUILD_AI_CONTEXT_TIMEOUT_MS: optionalPositiveIntSchema,
  PRIVY_APP_ID: z.string().min(1).optional(),
  PRIVY_VERIFICATION_KEY: z.string().min(1).optional(),
  CHAT_GRANT_SECRET: z.string().min(1),
  DOCS_VECTOR_STORE_ID: z.string().min(1).optional(),
  DEBUG_CHAT: z.string().min(1).optional(),
  DEBUG_HTTP: z.string().min(1).optional(),
  CHAT_ALLOWED_ORIGINS: z.string().min(1).optional(),
  NEYNAR_API_KEY: z.string().min(1).optional(),
  SELF_HOSTED_MODE: z.string().min(1).optional(),
  SELF_HOSTED_DEFAULT_ADDRESS: z.string().min(1).optional(),
  SELF_HOSTED_SHARED_SECRET: z.string().min(1).optional(),
});

const chatGrantSecretSchema = envSchema.pick({ CHAT_GRANT_SECRET: true });
const privyAppIdSchema = envSchema.pick({ PRIVY_APP_ID: true });
const privyVerificationKeySchema = envSchema.pick({ PRIVY_VERIFICATION_KEY: true });
const debugChatSchema = envSchema.pick({ DEBUG_CHAT: true });
const poolConfigSchema = envSchema.pick({
  POSTGRES_POOL_MAX: true,
  POSTGRES_POOL_IDLE_TIMEOUT_MS: true,
  POSTGRES_POOL_CONNECTION_TIMEOUT_MS: true,
  POSTGRES_POOL_STATS_INTERVAL_MS: true,
});
const rateLimitSchema = envSchema.pick({
  RATE_LIMIT_ENABLED: true,
  RATE_LIMIT_MAX: true,
  RATE_LIMIT_WINDOW_MS: true,
});
const timeoutSchema = envSchema.pick({
  OPENAI_REQUEST_TIMEOUT_MS: true,
  NEYNAR_REQUEST_TIMEOUT_MS: true,
  COBUILD_AI_CONTEXT_TIMEOUT_MS: true,
});
const selfHostedSchema = envSchema.pick({
  SELF_HOSTED_MODE: true,
  SELF_HOSTED_DEFAULT_ADDRESS: true,
  SELF_HOSTED_SHARED_SECRET: true,
});

export function validateEnvVariables() {
  const env = envSchema.parse(process.env);
  const selfHosted = isTruthy(env.SELF_HOSTED_MODE?.toLowerCase());
  if (!selfHosted && !env.PRIVY_APP_ID) {
    throw new Error("Missing required env: PRIVY_APP_ID");
  }
  if (!selfHosted && env.NODE_ENV === "production" && !env.PRIVY_VERIFICATION_KEY) {
    throw new Error("Missing required env in production: PRIVY_VERIFICATION_KEY");
  }
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
const DEFAULT_NEYNAR_TIMEOUT_MS = 8_000;
const DEFAULT_COBUILD_AI_CONTEXT_TIMEOUT_MS = 7_000;

const parsePoolEnv = () => poolConfigSchema.parse(process.env);
const parseRateLimitEnv = () => rateLimitSchema.parse(process.env);
const parseTimeoutEnv = () => timeoutSchema.parse(process.env);

export function loadDatabaseConfig(): DatabaseConfig {
  const env = validateEnvVariables();
  return {
    primaryUrl: env.POSTGRES_URL,
    replicaUrls: env.POSTGRES_REPLICA_URLS ?? [],
  };
}

export function getPostgresPoolOptions(): PostgresPoolOptions {
  const env = parsePoolEnv();
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
  const env = parsePoolEnv();
  return env.POSTGRES_POOL_STATS_INTERVAL_MS ?? null;
}

export function getRateLimitConfig(): {
  enabled: boolean;
  max: number;
  windowMs: number;
} {
  const env = parseRateLimitEnv();
  return {
    enabled: isTruthy(env.RATE_LIMIT_ENABLED),
    max: env.RATE_LIMIT_MAX ?? DEFAULT_RATE_LIMIT_MAX,
    windowMs: env.RATE_LIMIT_WINDOW_MS ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
  };
}

export function getOpenAiTimeoutMs(): number {
  const env = parseTimeoutEnv();
  return env.OPENAI_REQUEST_TIMEOUT_MS ?? DEFAULT_OPENAI_TIMEOUT_MS;
}

export function getNeynarTimeoutMs(): number {
  const env = parseTimeoutEnv();
  return env.NEYNAR_REQUEST_TIMEOUT_MS ?? DEFAULT_NEYNAR_TIMEOUT_MS;
}

export function getCobuildAiContextTimeoutMs(): number {
  const env = parseTimeoutEnv();
  return env.COBUILD_AI_CONTEXT_TIMEOUT_MS ?? DEFAULT_COBUILD_AI_CONTEXT_TIMEOUT_MS;
}

export function getChatGrantSecret(): string {
  return chatGrantSecretSchema.parse(process.env).CHAT_GRANT_SECRET;
}

export function getPrivyAppId(): string {
  const appId = privyAppIdSchema.parse(process.env).PRIVY_APP_ID;
  if (!appId) {
    throw new Error("Missing PRIVY_APP_ID");
  }
  return appId;
}

export function getPrivyVerificationKey(): string | null {
  const key = privyVerificationKeySchema.parse(process.env).PRIVY_VERIFICATION_KEY;
  if (!key && process.env.NODE_ENV === "production" && !isSelfHostedMode()) {
    throw new Error("Missing required env in production: PRIVY_VERIFICATION_KEY");
  }
  return key ?? null;
}

export function isChatDebugEnabled(): boolean {
  const flag = debugChatSchema.parse(process.env).DEBUG_CHAT?.toLowerCase();
  return flag === "true" || flag === "1";
}

export function isSelfHostedMode(): boolean {
  const flag = selfHostedSchema.parse(process.env).SELF_HOSTED_MODE?.toLowerCase();
  return isTruthy(flag);
}

export function getSelfHostedDefaultAddress(): string | null {
  return selfHostedSchema.parse(process.env).SELF_HOSTED_DEFAULT_ADDRESS ?? null;
}

export function getSelfHostedSharedSecret(): string | null {
  return selfHostedSchema.parse(process.env).SELF_HOSTED_SHARED_SECRET ?? null;
}

function isTruthy(value?: string | null): boolean {
  if (!value) return false;
  return value === "1" || value === "true" || value === "yes";
}

export { replicaUrlsSchema };
