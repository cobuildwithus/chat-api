import { describe, expect, it } from "vitest";
import { extractTextFromParts, getFirstUserText } from "../../src/chat/message-text";

describe("chat message text helpers", () => {
  it("extracts concatenated text from parts", () => {
    const parts = [
      { type: "text", text: "hello" },
      { type: "image", image: "https://example.com/a.png" },
      { type: "text", text: " world" },
    ];
    expect(extractTextFromParts(parts)).toBe("hello world");
  });

  it("returns empty string for non-array parts", () => {
    expect(extractTextFromParts("nope")).toBe("");
  });

  it("finds the first user message text", () => {
    const messages = [
      { role: "assistant", parts: [{ type: "text", text: "ignore" }] },
      { role: "user", parts: [{ type: "text", text: "hello" }] },
      { role: "user", parts: [{ type: "text", text: "later" }] },
    ] as any;
    expect(getFirstUserText(messages)).toBe("hello");
  });

  it("returns null when no user text is present", () => {
    const messages = [{ role: "assistant", parts: [{ type: "text", text: "nope" }] }] as any;
    expect(getFirstUserText(messages)).toBeNull();
  });
});
