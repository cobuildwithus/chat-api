import { describe, expect, it } from "vitest";
import { castPreviewTool } from "../../../src/ai/tools/cast-preview/cast-preview";

describe("castPreviewTool", () => {
  it("echoes the cast payload", async () => {
    const payload = { text: "hello", embeds: [{ url: "https://img" }] };
    const result = await castPreviewTool.tool.execute!(payload as any, {} as any);
    expect(result).toEqual(payload);
  });

  it("returns the cast preview prompt", async () => {
    const prompt = await castPreviewTool.prompt();
    expect(prompt).toContain("Cast Preview");
  });
});
