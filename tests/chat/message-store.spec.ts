import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeChatMessages } from "../../src/chat/message-store";
import { chat, chatMessage } from "../../src/infra/db/schema";
import { cobuildDb } from "../../src/infra/db/cobuildDb";
import { generateChatTitle } from "../../src/chat/generate-title";
import { queueCobuildDbResponse, resetAllMocks, setCobuildDbResponse } from "../utils/mocks/db";

vi.mock("../../src/chat/generate-title", () => ({
  generateChatTitle: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "uuid"),
}));

const generateChatTitleMock = vi.mocked(generateChatTitle);

const baseUser = {
  address: "0xabc",
  city: null,
  country: null,
  countryRegion: null,
  userAgent: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetAllMocks();
});

describe("storeChatMessages", () => {
  it("deletes existing messages when no messages are provided", async () => {
    setCobuildDbResponse(chat, [{ title: null }]);
    const deleteSpy = vi.spyOn(cobuildDb, "delete");

    await storeChatMessages({
      chatId: "chat-1",
      messages: [],
      type: "chat-default",
      data: {},
      user: baseUser,
    });

    expect(deleteSpy).toHaveBeenCalledWith(chatMessage);
    expect(generateChatTitleMock).not.toHaveBeenCalled();
  });

  it("generates and stores a title when missing", async () => {
    setCobuildDbResponse(chat, [{ title: null }]);
    setCobuildDbResponse(chatMessage, []);
    generateChatTitleMock.mockResolvedValue("Cobuild progress");
    const updateSpy = vi.spyOn(cobuildDb, "update");

    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "hello world" }],
      },
      {
        id: "m2",
        role: "assistant",
        parts: [{ type: "text", text: "response" }],
      },
    ];

    await storeChatMessages({
      chatId: "chat-2",
      messages,
      type: "chat-default",
      data: {},
      user: baseUser,
    });

    expect(generateChatTitleMock).toHaveBeenCalledWith("hello world");
    expect(updateSpy).toHaveBeenCalledWith(chat);
  });

  it("skips title generation when disabled", async () => {
    const deleteSpy = vi.spyOn(cobuildDb, "delete");

    await storeChatMessages({
      chatId: "chat-3",
      messages: [],
      type: "chat-default",
      data: {},
      user: baseUser,
      generateTitle: false,
    });

    expect(deleteSpy).toHaveBeenCalledWith(chatMessage);
    expect(generateChatTitleMock).not.toHaveBeenCalled();
  });

  it("uses existing message ids and client ids when available", async () => {
    setCobuildDbResponse(chatMessage, [
      { id: "m1", clientId: "client-1", createdAt: new Date("2024-01-01") },
      { id: "m2", clientId: "client-2", createdAt: new Date("2024-01-02") },
    ]);
    setCobuildDbResponse(chat, [{ title: "Existing title" }]);

    await storeChatMessages({
      chatId: "chat-4",
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
        { role: "user", parts: [{ type: "text", text: "hi again" }] } as UIMessage,
        { role: "assistant", parts: [] } as UIMessage,
      ],
      type: "chat-default",
      data: {},
      user: baseUser,
      clientMessageId: "client-2",
    });

    expect(generateChatTitleMock).not.toHaveBeenCalled();
  });

  it("assigns ids for new messages without ids", async () => {
    setCobuildDbResponse(chatMessage, []);
    setCobuildDbResponse(chat, [{ title: "Existing title" }]);

    await storeChatMessages({
      chatId: "chat-4b",
      messages: [
        { role: "user", parts: [{ type: "text", text: "new" }] } as UIMessage,
        { role: "assistant", parts: [] } as UIMessage,
      ],
      type: "chat-default",
      data: {},
      user: baseUser,
    });

    expect(generateChatTitleMock).not.toHaveBeenCalled();
  });

  it("skips title generation when no user message exists", async () => {
    setCobuildDbResponse(chatMessage, []);
    setCobuildDbResponse(chat, [{ title: null }]);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await storeChatMessages({
      chatId: "chat-5",
      messages: [{ role: "assistant", parts: [] } as UIMessage],
      type: "chat-default",
      data: {},
      user: baseUser,
    });

    expect(infoSpy).toHaveBeenCalledWith(
      "Skipping title generation for chat-5: no user message found.",
    );
    infoSpy.mockRestore();
  });

  it("logs when title generation returns empty", async () => {
    setCobuildDbResponse(chatMessage, []);
    setCobuildDbResponse(chat, [{ title: null }]);
    generateChatTitleMock.mockResolvedValueOnce(null);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await storeChatMessages({
      chatId: "chat-5b",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] } as UIMessage],
      type: "chat-default",
      data: {},
      user: baseUser,
    });

    expect(infoSpy).toHaveBeenCalledWith("Title generation returned empty for chat-5b.");
    infoSpy.mockRestore();
  });

  it("handles title generation errors", async () => {
    setCobuildDbResponse(chatMessage, []);
    setCobuildDbResponse(chat, [{ title: null }]);
    generateChatTitleMock.mockRejectedValueOnce(new Error("fail"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await storeChatMessages({
      chatId: "chat-6",
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] } as UIMessage],
      type: "chat-default",
      data: {},
      user: baseUser,
    });

    expect(errorSpy).toHaveBeenCalledWith("Failed to store chat title", expect.any(Error));
    errorSpy.mockRestore();
  });
});
