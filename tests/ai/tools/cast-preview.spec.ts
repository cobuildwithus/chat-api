import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { castPreviewTool } from "../../../src/ai/tools/cast-preview/cast-preview";

describe("castPreviewTool", () => {
  it("echoes the cast payload", async () => {
    const payload: { text: string; embeds: Array<{ url: string }> } = {
      text: "hello",
      embeds: [{ url: "https://img" }],
    };
    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await castPreviewTool.tool.execute!(payload, context);
    expect(result).toEqual(payload);
  });

  it("returns the cast preview prompt", async () => {
    const prompt = await castPreviewTool.prompt();
    expect(prompt).toContain("Cast Preview");
  });
});
