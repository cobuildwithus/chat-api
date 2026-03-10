import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { getCastTool } from "../../../src/ai/tools/get-cast/get-cast";
import { executeTool } from "../../../src/tools/registry";

vi.mock("../../../src/tools/registry", () => ({
  executeTool: vi.fn(),
  resolveToolExposure: vi.fn(() => "chat-safe"),
  resolveToolInputSchema: vi.fn(() => ({})),
}));

describe("getCastTool", () => {
  it("returns canonical tool output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: true,
      name: "get-cast",
      output: { hash: "0xabc" },
    });

    const input = { identifier: "0xabc", type: "hash" } as const;
    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await getCastTool.tool.execute!(input, context);
    expect(result).toEqual({ hash: "0xabc" });
    expect(executeTool).toHaveBeenCalledWith("get-cast", input);
  });

  it("returns canonical tool errors as structured output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: false,
      name: "get-cast",
      statusCode: 404,
      error: "Cast not found.",
    });

    const input = { identifier: "0xmissing", type: "hash" } as const;
    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await getCastTool.tool.execute!(input, context);
    expect(result).toEqual({ error: "Cast not found." });
  });

  it("returns the tool prompt", async () => {
    const prompt = await getCastTool.prompt();
    expect(prompt).toContain("Get Cast Tool");
  });
});
