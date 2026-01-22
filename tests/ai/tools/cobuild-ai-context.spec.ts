import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { cobuildAiContextTool } from "../../../src/ai/tools/cobuild-ai-context/tool";
import { fetchCobuildAiContextFresh, formatCobuildAiContextError } from "../../../src/infra/cobuild-ai-context";

vi.mock("../../../src/infra/cobuild-ai-context", () => ({
  fetchCobuildAiContextFresh: vi.fn(),
  formatCobuildAiContextError: vi.fn((error: unknown) => String(error)),
  COBUILD_AI_CONTEXT_URL: "https://co.build/api/cobuild/ai-context",
}));

describe("cobuildAiContextTool", () => {
  it("returns fresh data when fetch succeeds", async () => {
    vi.mocked(fetchCobuildAiContextFresh).mockResolvedValue({ ok: true });

    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await cobuildAiContextTool.tool.execute!({}, context);
    expect(result).toEqual({ ok: true });
  });

  it("returns formatted error when fetch fails", async () => {
    vi.mocked(fetchCobuildAiContextFresh).mockRejectedValue(new Error("down"));
    vi.mocked(formatCobuildAiContextError).mockReturnValue("down");

    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await cobuildAiContextTool.tool.execute!({}, context);
    expect(result).toEqual({ error: "down" });
  });

  it("returns the tool prompt", async () => {
    const prompt = await cobuildAiContextTool.prompt();
    expect(prompt).toContain("Cobuild Live Stats Tool");
  });
});
