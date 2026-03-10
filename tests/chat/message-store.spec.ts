import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatMessageAlreadyProcessedError,
  ChatMessageInProgressError,
  InvalidChatRequestMessageError,
  prepareChatRequestMessages,
  storeAssistantMessages,
} from "../../src/chat/message-store";
import { generateChatTitle } from "../../src/chat/generate-title";
import { chat, chatMessage } from "../../src/infra/db/schema";
import { cobuildDb } from "../../src/infra/db/cobuildDb";
import {
  queueCobuildDbResponse,
  resetAllMocks,
  setCobuildDbResponse,
} from "../utils/mocks/db";

vi.mock("../../src/chat/generate-title", () => ({
  generateChatTitle: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "00000000-0000-0000-0000-000000000010"),
}));

const generateChatTitleMock = vi.mocked(generateChatTitle);
const randomUUIDMock = vi.mocked(randomUUID);

beforeEach(() => {
  vi.clearAllMocks();
  resetAllMocks();
  randomUUIDMock.mockReturnValue("00000000-0000-0000-0000-000000000010");
});

describe("prepareChatRequestMessages", () => {
  it("appends a new user message and updates only updatedAt on the chat row", async () => {
    setCobuildDbResponse(chatMessage, []);
    generateChatTitleMock.mockResolvedValue("Cobuild progress");
    const updateSpy = vi.spyOn(cobuildDb, "update");

    const prepared = await prepareChatRequestMessages({
      chatId: "chat-1",
      clientMessageId: "client-1",
      userMessage: "hello world",
      existingTitle: null,
    });

    expect(prepared.streamMessages).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000010",
        role: "user",
        parts: [{ type: "text", text: "hello world" }],
      },
    ]);
    expect(prepared.modelMessages).toEqual(prepared.streamMessages);
    expect(updateSpy).toHaveBeenCalledWith(chat);
    expect(updateSpy).toHaveBeenNthCalledWith(1, chat);
    expect(updateSpy).toHaveBeenNthCalledWith(2, chat);
  });

  it("accepts attachment-only user turns", async () => {
    setCobuildDbResponse(chatMessage, []);
    generateChatTitleMock.mockResolvedValue(null);

    const prepared = await prepareChatRequestMessages({
      chatId: "chat-attachments",
      clientMessageId: "client-attachments",
      userMessage: "   ",
      attachments: [{ type: "image", image: "https://cdn.example.com/a.png" }],
      existingTitle: "Existing title",
    });

    expect(prepared.streamMessages).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000010",
        role: "user",
        parts: [
          {
            type: "file",
            url: "https://cdn.example.com/a.png",
            mediaType: "image/*",
          },
        ],
      },
    ]);
    expect(generateChatTitleMock).not.toHaveBeenCalled();
  });

  it("rejects empty user turns", async () => {
    await expect(
      prepareChatRequestMessages({
        chatId: "chat-empty",
        clientMessageId: "client-empty",
        userMessage: "   ",
        existingTitle: null,
      }),
    ).rejects.toThrow(InvalidChatRequestMessageError);
  });

  it("does not allow a duplicate clientMessageId to overwrite a different user message", async () => {
    setCobuildDbResponse(chatMessage, [
      {
        id: "user-1",
        clientId: "client-1",
        role: "user",
        parts: [{ type: "text", text: "first" }],
        metadata: null,
        position: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
    ]);

    await expect(
      prepareChatRequestMessages({
        chatId: "chat-1",
        clientMessageId: "client-1",
        userMessage: "second",
        existingTitle: "Existing title",
      }),
    ).rejects.toThrow(InvalidChatRequestMessageError);
  });

  it("rejects replaying an older clientMessageId after later user turns already exist", async () => {
    setCobuildDbResponse(chatMessage, [
      {
        id: "user-1",
        clientId: "client-1",
        role: "user",
        parts: [{ type: "text", text: "first" }],
        metadata: null,
        position: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "user-2",
        clientId: "client-2",
        role: "user",
        parts: [{ type: "text", text: "second" }],
        metadata: null,
        position: 1,
        createdAt: new Date("2024-01-01T00:00:01Z"),
      },
    ]);

    await expect(
      prepareChatRequestMessages({
        chatId: "chat-replayed",
        clientMessageId: "client-1",
        userMessage: "first",
        existingTitle: "Existing title",
      }),
    ).rejects.toThrow(ChatMessageAlreadyProcessedError);
  });

  it("returns 409-style conflicts for in-progress and completed assistant history", async () => {
    setCobuildDbResponse(chatMessage, [
      {
        id: "user-1",
        clientId: "client-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
        metadata: null,
        position: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "assistant-pending",
        clientId: null,
        role: "assistant",
        parts: [],
        metadata: { pending: true },
        position: 1,
        createdAt: new Date("2024-01-01T00:00:01Z"),
      },
    ]);

    await expect(
      prepareChatRequestMessages({
        chatId: "chat-pending",
        clientMessageId: "client-1",
        userMessage: "hello",
        existingTitle: "Existing title",
      }),
    ).rejects.toThrow(ChatMessageInProgressError);

    setCobuildDbResponse(chatMessage, [
      {
        id: "user-1",
        clientId: "client-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
        metadata: null,
        position: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "assistant-pending",
        clientId: null,
        role: "assistant",
        parts: [],
        metadata: { pending: true },
        position: 1,
        createdAt: new Date("2024-01-01T00:00:01Z"),
      },
    ]);

    await expect(
      prepareChatRequestMessages({
        chatId: "chat-inflight",
        clientMessageId: "client-2",
        userMessage: "next",
        existingTitle: "Existing title",
      }),
    ).rejects.toThrow(ChatMessageInProgressError);

    setCobuildDbResponse(chatMessage, [
      {
        id: "user-1",
        clientId: "client-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
        metadata: null,
        position: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "assistant-1",
        clientId: null,
        role: "assistant",
        parts: [{ type: "text", text: "done" }],
        metadata: null,
        position: 1,
        createdAt: new Date("2024-01-01T00:00:01Z"),
      },
    ]);

    await expect(
      prepareChatRequestMessages({
        chatId: "chat-done",
        clientMessageId: "client-1",
        userMessage: "hello",
        existingTitle: "Existing title",
      }),
    ).rejects.toThrow(ChatMessageAlreadyProcessedError);
  });

  it("reuses stored user history after a failed assistant without rewriting the user row", async () => {
    setCobuildDbResponse(chatMessage, [
      {
        id: "user-1",
        clientId: "client-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
        metadata: null,
        position: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "assistant-error",
        clientId: null,
        role: "assistant",
        parts: [{ type: "text", text: "failed" }],
        metadata: { error: true },
        position: 1,
        createdAt: new Date("2024-01-01T00:00:01Z"),
      },
    ]);
    const insertSpy = vi.spyOn(cobuildDb, "insert");

    const prepared = await prepareChatRequestMessages({
      chatId: "chat-retry",
      clientMessageId: "client-1",
      userMessage: "hello",
      existingTitle: "Existing title",
    });

    expect(prepared.streamMessages).toEqual([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
      {
        id: "assistant-error",
        role: "assistant",
        parts: [{ type: "text", text: "failed" }],
        metadata: { error: true },
      },
    ]);
    expect(prepared.modelMessages).toEqual([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
    ]);
    expect(insertSpy).not.toHaveBeenCalledWith(chatMessage);
  });
});

describe("storeAssistantMessages", () => {
  it("rejects untrusted assistant ids", async () => {
    setCobuildDbResponse(chatMessage, []);

    await expect(
      storeAssistantMessages({
        chatId: "chat-1",
        messages: [{ id: "assistant-1", role: "assistant", parts: [] }],
        trustedMessageIds: [],
      }),
    ).rejects.toThrow(InvalidChatRequestMessageError);
  });

  it("updates the pending assistant row and appends later assistant messages without deleting history", async () => {
    setCobuildDbResponse(chatMessage, [
      {
        id: "user-1",
        clientId: "client-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
        metadata: null,
        position: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "assistant-pending",
        clientId: null,
        role: "assistant",
        parts: [],
        metadata: { pending: true },
        position: 1,
        createdAt: new Date("2024-01-01T00:00:01Z"),
      },
    ]);
    const insertSpy = vi.spyOn(cobuildDb, "insert");
    const deleteSpy = vi.spyOn(cobuildDb, "delete");

    await storeAssistantMessages({
      chatId: "chat-1",
      messages: [
        {
          id: "assistant-pending",
          role: "assistant",
          parts: [{ type: "text", text: "first answer" }],
        },
        {
          id: "assistant-2",
          role: "assistant",
          parts: [{ type: "text", text: "follow-up" }],
        },
      ],
      trustedMessageIds: ["assistant-pending", "assistant-2"],
    });

    expect(insertSpy).toHaveBeenCalledWith(chatMessage);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
