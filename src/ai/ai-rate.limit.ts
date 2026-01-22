import { getUsage, recordUsage } from "../infra/rate-limit";

const MAX_AI_USAGE_PER_USER = process.env.NODE_ENV === "production" ? 225000 : 2000000; // 125k tokens
const MAX_AI_USAGE_WINDOW = 360; // per 6 hours

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

// per fid
const MAX_AI_USAGE_PER_FID = 250000; // 250k tokens
const MAX_AI_USAGE_WINDOW_PER_FID = 1440; // per 24 hours (in minutes)

async function getAiUsagePerFid(fid: number) {
  return await getUsage(`ai:fid:${fid}`, MAX_AI_USAGE_WINDOW_PER_FID);
}

export async function recordAiUsagePerFid(fid: number, usage: number) {
  return await recordUsage(`ai:fid:${fid}`, usage);
}

export async function isAiUsageAvailablePerFid(fid: number) {
  const usage = await getAiUsagePerFid(fid);
  return usage < MAX_AI_USAGE_PER_FID;
}
