import { describe, expect, it } from "vitest";
import { chatDefaultPersonalityPrompt } from "../../../src/ai/agents/chat-default/personality";

describe("chatDefaultPersonalityPrompt", () => {
  it("contains base role description", () => {
    expect(chatDefaultPersonalityPrompt).toContain("Cobuild AI");
  });
});
