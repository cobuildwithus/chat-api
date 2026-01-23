import { getCobuildAiContextTimeoutMs } from "../config/env";
import { cacheResult, getCachedResult } from "./cache/cacheResult";

export const COBUILD_AI_CONTEXT_URL = "https://co.build/api/cobuild/ai-context";
const CACHE_PREFIX = "cobuild:ai-context:";
const CACHE_KEY = "snapshot";
const CACHE_TTL_SECONDS = 60 * 15;
const DEFAULT_TIMEOUT_MS = getCobuildAiContextTimeoutMs();
const ERROR_MAX_CHARS = 120;

export type CobuildAiContextResponse = Record<string, unknown>;

function truncate(value: string, maxLength = ERROR_MAX_CHARS): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function formatCobuildAiContextError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return truncate(error.message);
  }
  if (typeof error === "string") return truncate(error);
  return "Unknown error";
}

async function fetchCobuildAiContext(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<CobuildAiContextResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(COBUILD_AI_CONTEXT_URL, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as CobuildAiContextResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCobuildAiContextFresh(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<CobuildAiContextResponse> {
  return fetchCobuildAiContext(timeoutMs);
}

export async function getCobuildAiContextSnapshot(): Promise<{
  data: CobuildAiContextResponse | null;
  error?: string;
}> {
  const cached = await getCachedResult<CobuildAiContextResponse>(CACHE_KEY, CACHE_PREFIX);
  if (cached) return { data: cached };

  try {
    const data = await fetchCobuildAiContext();
    await cacheResult(CACHE_KEY, CACHE_PREFIX, async () => data, CACHE_TTL_SECONDS);
    return { data };
  } catch (error) {
    return { data: null, error: formatCobuildAiContextError(error) };
  }
}
