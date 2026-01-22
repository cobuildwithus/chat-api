import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelUsage, ModelMessage, SystemModelMessage } from "ai";
import {
  CHAT_PERSIST_ERROR,
  buildStreamMessages,
  createReasoningTracker,
  recordUsageIfPresent,
  resolveIsMobileRequest,
  streamErrorMessage,
} from "../../../src/api/chat/chat-helpers";
import { recordAiUsage } from "../../../src/ai/ai-rate.limit";

vi.mock("../../../src/ai/ai-rate.limit", () => ({
  recordAiUsage: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("chat helpers", () => {
  it("formats stream error messages", () => {
    expect(streamErrorMessage(new Error("boom"))).toBe("boom");
    expect(streamErrorMessage("oops")).toBe("Chat failed to send. Please try again.");
    expect(CHAT_PERSIST_ERROR).toContain("save");
  });

  it("records usage only when tokens are present", async () => {
    const usage = Promise.resolve({ totalTokens: 0 } as LanguageModelUsage);
    await recordUsageIfPresent(usage, "0xabc");
    expect(recordAiUsage).not.toHaveBeenCalled();

    const usage2 = Promise.resolve({ totalTokens: 10 } as LanguageModelUsage);
    await recordUsageIfPresent(usage2, "0xabc");
    expect(recordAiUsage).toHaveBeenCalledWith("0xabc", 10);
  });

  it("resolves mobile requests based on header or user agent", () => {
    expect(resolveIsMobileRequest("mobile", "Mozilla")).toBe(true);
    expect(resolveIsMobileRequest("desktop", "Mozilla/5.0 (iPhone)")).toBe(false);
    expect(resolveIsMobileRequest(undefined, "Mozilla/5.0 (iPhone)")).toBe(true);
    expect(resolveIsMobileRequest(undefined, undefined)).toBe(false);
  });

  it("builds stream messages with context and attachments", () => {
    const system: SystemModelMessage[] = [{ role: "system", content: "sys" }];
    const modelMessages: ModelMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "hi" },
          { type: "image", image: "https://img" },
          { type: "file", data: new URL("https://video"), mediaType: "video/mp4" },
        ],
      },
    ];

    const result = buildStreamMessages(system, modelMessages, "  context  ");

    const contextMessage = result.find(
      (message) => message.role === "system" &&
        typeof message.content === "string" &&
        message.content.includes("Additional context: context"),
    );
    expect(contextMessage).toBeTruthy();

    const attachmentsMessage = result.find(
      (message) => message.role === "system" &&
        typeof message.content === "string" &&
        message.content.includes("attachments"),
    );
    expect(attachmentsMessage).toBeTruthy();

    const userMessage = result.find((message) => message.role === "user");
    expect(userMessage).toBeTruthy();
    const parts = userMessage?.content as Array<{ type: string; mediaType?: string }>;
    expect(parts.find((part) => part.mediaType?.startsWith("video/"))).toBeUndefined();
  });

  it("tracks reasoning duration between start and finish", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));

    try {
      const tracker = createReasoningTracker();
      expect(tracker.trackPart({ type: "noop" })).toBeUndefined();
      tracker.trackPart({ type: "start" });

      vi.setSystemTime(new Date("2025-01-01T00:00:05Z"));
      const metadata = tracker.trackPart({ type: "finish" });
      expect(metadata).toEqual({ reasoningDurationMs: 5000 });
    } finally {
      vi.useRealTimers();
    }
  });
});
