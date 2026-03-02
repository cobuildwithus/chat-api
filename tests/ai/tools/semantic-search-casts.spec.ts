import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { semanticSearchCastsTool } from "../../../src/ai/tools/semantic-search-casts/semantic-search-casts";
import { executeTool } from "../../../src/api/tools/registry";

vi.mock("../../../src/api/tools/registry", () => ({
  executeTool: vi.fn(),
}));

describe("semanticSearchCastsTool", () => {
  it("returns canonical tool output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: true,
      name: "semantic-search-casts",
      output: { count: 1, items: [{ hash: "0xabc", similarity: 0.9 }] },
    });

    const input = { query: "grants for builders", limit: 5 };
    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await semanticSearchCastsTool.tool.execute!(input, context);
    expect(result).toEqual({ count: 1, items: [{ hash: "0xabc", similarity: 0.9 }] });
    expect(executeTool).toHaveBeenCalledWith("semantic-search-casts", input);
  });

  it("returns canonical tool errors as structured output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 502,
      error: "semantic-search-casts request failed: OpenAI embeddings request failed.",
    });

    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await semanticSearchCastsTool.tool.execute!({ query: "test" }, context);
    expect(result).toEqual({
      error: "semantic-search-casts request failed: OpenAI embeddings request failed.",
    });
  });

  it("returns the tool prompt", async () => {
    const prompt = await semanticSearchCastsTool.prompt();
    expect(prompt).toContain("Semantic Search Casts Tool");
  });
});
