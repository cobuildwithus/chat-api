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

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]),
  OPENAI_API_KEY: z.string().min(1),
  REDIS_URL: z.string().min(1),
  POSTGRES_URL: z.string().min(1),
  POSTGRES_REPLICA_URLS: replicaUrlsSchema,
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

export function loadDatabaseConfig(): DatabaseConfig {
  const env = validateEnvVariables();
  return {
    primaryUrl: env.POSTGRES_URL,
    replicaUrls: env.POSTGRES_REPLICA_URLS ?? [],
  };
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
