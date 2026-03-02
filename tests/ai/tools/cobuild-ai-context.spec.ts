import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { cobuildAiContextTool } from "../../../src/ai/tools/cobuild-ai-context/tool";
import { executeTool } from "../../../src/api/tools/registry";

vi.mock("../../../src/api/tools/registry", () => ({
  executeTool: vi.fn(),
}));

describe("cobuildAiContextTool", () => {
  it("returns canonical tool output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: true,
      name: "get-treasury-stats",
      output: { ok: true },
    });

    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await cobuildAiContextTool.tool.execute!({}, context);
    expect(result).toEqual({ ok: true });
    expect(executeTool).toHaveBeenCalledWith("get-treasury-stats", {});
  });

  it("returns canonical tool errors as structured output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: false,
      name: "get-treasury-stats",
      statusCode: 503,
      error: "Treasury stats snapshot is not configured.",
    });

    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await cobuildAiContextTool.tool.execute!({}, context);
    expect(result).toEqual({ error: "Treasury stats snapshot is not configured." });
  });

  it("returns the tool prompt", async () => {
    const prompt = await cobuildAiContextTool.prompt();
    expect(prompt).toContain("Treasury Stats Tool");
  });
});
