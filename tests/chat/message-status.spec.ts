import { beforeEach, describe, expect, it } from "vitest";
import { clearPendingAssistantIfUnclaimed, markAssistantMessageFailed } from "../../src/chat/message-status";
import { chatMessage } from "../../src/infra/db/schema";
import { getDbCallCount, resetAllMocks } from "../utils/mocks/db";

beforeEach(() => {
  resetAllMocks();
});

describe("message status", () => {
  it("marks assistant message failed", async () => {
    await markAssistantMessageFailed("chat-1", "msg-1", "boom");
    expect(getDbCallCount(chatMessage)).toBe(1);
  });

  it("clears pending assistant when not claimed", async () => {
    await clearPendingAssistantIfUnclaimed("chat-1", "pending-1", []);
    expect(getDbCallCount(chatMessage)).toBe(1);
  });

  it("does not clear pending assistant when claimed", async () => {
    await clearPendingAssistantIfUnclaimed("chat-1", "pending-1", [
      { id: "pending-1", role: "assistant", parts: [] },
    ] as any);
    expect(getDbCallCount(chatMessage)).toBe(0);
  });
});
