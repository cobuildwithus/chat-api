import type { LanguageModelUsage, ModelMessage, SystemModelMessage } from "ai";
import { recordAiUsage } from "../../ai/ai-rate.limit";
import { getAttachmentsPrompt, getMessagesWithoutVideos } from "../../ai/utils/attachments";

export const CHAT_PERSIST_ERROR = "We couldn't save this chat. Please retry.";

export const streamErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  return "Chat failed to send. Please try again.";
};

export async function recordUsageIfPresent(
  usagePromise: PromiseLike<LanguageModelUsage>,
  address: string,
) {
  const usage = await usagePromise;
  if (!usage.totalTokens) return;
  await recordAiUsage(address, usage.totalTokens);
}

export function resolveIsMobileRequest(
  clientDeviceHeader: string | string[] | undefined,
  userAgent: string | null | undefined,
): boolean {
  const clientDevice =
    typeof clientDeviceHeader === "string" ? clientDeviceHeader.toLowerCase() : null;
  if (clientDevice === "mobile") return true;
  if (clientDevice === "desktop") return false;
  return isMobileUserAgent(userAgent);
}

function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    userAgent
  );
}

export function buildStreamMessages(
  system: SystemModelMessage[],
  modelMessages: ModelMessage[],
  context?: string,
): ModelMessage[] {
  const cleanedContext = context?.trim();
  const attachmentsPrompt = getAttachmentsPrompt(modelMessages);
  const messagesWithoutVideos = getMessagesWithoutVideos(modelMessages);

  return [
    ...system,
    ...(cleanedContext
      ? [{ role: "system" as const, content: `Additional context: ${cleanedContext}` }]
      : []),
    ...(attachmentsPrompt ? [attachmentsPrompt] : []),
    ...messagesWithoutVideos,
  ];
}

export function createReasoningTracker() {
  let startedAt = Date.now();

  const trackPart = (part: { type: string }) => {
    if (part.type === "start") {
      startedAt = Date.now();
      return undefined;
    }
    if (part.type !== "finish") return undefined;
    return { reasoningDurationMs: Math.max(0, Date.now() - startedAt) };
  };

  return { trackPart };
}
