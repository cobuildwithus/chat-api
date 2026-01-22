import { describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { generateChatTitle } from "../../src/chat/generate-title";

const generateTextMock = vi.mocked(generateText);

describe("generateChatTitle", () => {
  it("returns null for empty input", async () => {
    const result = await generateChatTitle("   ");
    expect(result).toBeNull();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("strips surrounding quotes from the model response", async () => {
    generateTextMock.mockResolvedValue({ text: "\"Cobuild roadmap\"" } as any);

    const result = await generateChatTitle("some message");

    expect(result).toBe("Cobuild roadmap");
  });

  it("logs details when the model returns an empty title", async () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const longBody = { blob: "x".repeat(2100) };
    generateTextMock.mockResolvedValue({
      text: "   ",
      response: { body: longBody, messages: [] },
    } as any);

    const result = await generateChatTitle("message");
    expect(result).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      "Chat title generation returned empty text.",
      expect.objectContaining({
        responseBody: expect.stringContaining("truncated"),
      }),
    );
    logSpy.mockRestore();
  });

  it("handles unserializable response bodies", async () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const circular: any = { value: "x" };
    circular.self = circular;
    generateTextMock.mockResolvedValue({
      text: "",
      response: { body: circular, messages: [] },
    } as any);

    const result = await generateChatTitle("message");
    expect(result).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      "Chat title generation returned empty text.",
      expect.objectContaining({
        responseBody: "[unserializable response body]",
      }),
    );
    logSpy.mockRestore();
  });
});
