import { acquireRedisSemaphoreLease, type RedisSemaphoreLease } from "../infra/redis";
import {
  checkAndRecordUsage,
  getUsage,
  recordUsage,
  removeRecordedUsage,
} from "../infra/rate-limit";

const MAX_AI_USAGE_PER_USER = process.env.NODE_ENV === "production" ? 225000 : 2000000; // 125k tokens
const MAX_AI_USAGE_WINDOW = 360; // per 6 hours
const AI_USAGE_ADMISSION_RESERVATION = 1000;
const MAX_AI_INFLIGHT_PER_USER = 2;
const MAX_AI_INFLIGHT_PER_CHAT = 1;
const AI_INFLIGHT_TTL_MS = 60_000;

export type AiGenerationAdmissionErrorCode =
  | "rate-limited"
  | "user-inflight-limit"
  | "chat-inflight-limit";

export type AiGenerationAdmission = {
  reservedUsage: number;
  finalizeUsage: (totalTokens: number) => Promise<void>;
  release: () => Promise<void>;
};

export type AiGenerationAdmissionResult =
  | {
      allowed: true;
      admission: AiGenerationAdmission;
    }
  | {
      allowed: false;
      code: AiGenerationAdmissionErrorCode;
      retryAfterSeconds: number;
    };

// per address
async function getAiUsage(address: string) {
  return await getUsage(`ai:${address}`, MAX_AI_USAGE_WINDOW);
}

export async function recordAiUsage(address: string, usage: number) {
  return await recordUsage(`ai:${address}`, usage);
}
export async function isAiUsageAvailable(address: string) {
  const usage = await getAiUsage(address);
  return usage < MAX_AI_USAGE_PER_USER;
}

export async function admitAiGeneration(
  address: string,
  chatId: string,
  requestId: string,
): Promise<AiGenerationAdmissionResult> {
  const userLease = await acquireRedisSemaphoreLease(`ai:inflight:user:${address}`, {
    maxCount: MAX_AI_INFLIGHT_PER_USER,
    ttlMs: AI_INFLIGHT_TTL_MS,
    member: requestId,
  });
  if (!userLease) {
    return { allowed: false, code: "user-inflight-limit", retryAfterSeconds: 1 };
  }

  const chatLease = await acquireRedisSemaphoreLease(`ai:inflight:chat:${chatId}`, {
    maxCount: MAX_AI_INFLIGHT_PER_CHAT,
    ttlMs: AI_INFLIGHT_TTL_MS,
    member: requestId,
  });
  if (!chatLease) {
    await userLease.release();
    return { allowed: false, code: "chat-inflight-limit", retryAfterSeconds: 1 };
  }

  const usageMemberValue = `${AI_USAGE_ADMISSION_RESERVATION}|${requestId}`;
  const usageResult = await checkAndRecordUsage(`ai:${address}`, {
    windowMinutes: MAX_AI_USAGE_WINDOW,
    maxUsage: MAX_AI_USAGE_PER_USER,
    usageToAdd: AI_USAGE_ADMISSION_RESERVATION,
    memberValue: usageMemberValue,
  });
  if (!usageResult.allowed) {
    await releaseLeases(userLease, chatLease);
    return {
      allowed: false,
      code: "rate-limited",
      retryAfterSeconds: usageResult.retryAfterSeconds,
    };
  }

  let finalized = false;
  return {
    allowed: true,
    admission: {
      reservedUsage: AI_USAGE_ADMISSION_RESERVATION,
      finalizeUsage: async (totalTokens: number) => {
        finalized = true;
        const extraUsage = Math.max(0, totalTokens - AI_USAGE_ADMISSION_RESERVATION);
        if (extraUsage > 0) {
          await recordAiUsage(address, extraUsage);
        }
      },
      release: async () => {
        await Promise.all([
          ...(finalized ? [] : [removeRecordedUsage(`ai:${address}`, usageMemberValue)]),
          releaseLeases(userLease, chatLease),
        ]);
      },
    },
  };
}

async function releaseLeases(...leases: RedisSemaphoreLease[]) {
  await Promise.all(leases.map((lease) => lease.release()));
}
