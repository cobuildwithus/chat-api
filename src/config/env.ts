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
  COBUILD_REDIS_URL: z.string().min(1),
  COBUILD_POSTGRES_URL: z.string().min(1),
  COBUILD_POSTGRES_REPLICA_URLS: replicaUrlsSchema,
  PRIVY_APP_ID: z.string().min(1),
  PRIVY_VERIFICATION_KEY: z.string().min(1).optional(),
  CHAT_GRANT_SECRET: z.string().min(1),
  DOCS_VECTOR_STORE_ID: z.string().min(1).optional(),
  DEBUG_CHAT: z.string().min(1).optional(),
  DEBUG_HTTP: z.string().min(1).optional(),
  CHAT_ALLOWED_ORIGINS: z.string().min(1).optional(),
  NEYNAR_API_KEY_NOTIFICATIONS: z.string().min(1),
});

const chatGrantSecretSchema = envSchema.pick({ CHAT_GRANT_SECRET: true });
const privyAppIdSchema = envSchema.pick({ PRIVY_APP_ID: true });
const privyVerificationKeySchema = envSchema.pick({ PRIVY_VERIFICATION_KEY: true });
const debugChatSchema = envSchema.pick({ DEBUG_CHAT: true });

export function validateEnvVariables() {
  const env = envSchema.parse(process.env);
  if (env.NODE_ENV === "production") {
    if (!env.PRIVY_VERIFICATION_KEY) {
      throw new Error("Missing required env in production: PRIVY_VERIFICATION_KEY");
    }
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
    primaryUrl: env.COBUILD_POSTGRES_URL,
    replicaUrls: env.COBUILD_POSTGRES_REPLICA_URLS ?? [],
  };
}

export function getChatGrantSecret(): string {
  return chatGrantSecretSchema.parse(process.env).CHAT_GRANT_SECRET;
}

export function getPrivyAppId(): string {
  return privyAppIdSchema.parse(process.env).PRIVY_APP_ID;
}

export function getPrivyVerificationKey(): string | null {
  const key = privyVerificationKeySchema.parse(process.env).PRIVY_VERIFICATION_KEY;
  if (!key && process.env.NODE_ENV === "production") {
    throw new Error("Missing required env in production: PRIVY_VERIFICATION_KEY");
  }
  return key ?? null;
}

export function isChatDebugEnabled(): boolean {
  const flag = debugChatSchema.parse(process.env).DEBUG_CHAT?.toLowerCase();
  return flag === "true" || flag === "1";
}

export { replicaUrlsSchema };
