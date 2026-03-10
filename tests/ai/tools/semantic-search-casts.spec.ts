import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { semanticSearchCastsTool } from "../../../src/ai/tools/semantic-search-casts/semantic-search-casts";
import { executeTool } from "../../../src/tools/registry";

const mocks = vi.hoisted(() => ({
  executeTool: vi.fn(),
  resolveToolExposure: vi.fn(() => "chat-safe"),
  resolveToolInputSchema: vi.fn(() =>
    z.object({
      query: z.string(),
      limit: z.number().optional(),
      rootHash: z.string().optional(),
    }),
  ),
}));

vi.mock("../../../src/tools/registry", () => ({
  executeTool: mocks.executeTool,
  resolveToolExposure: mocks.resolveToolExposure,
  resolveToolInputSchema: mocks.resolveToolInputSchema,
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
      error: "Tool request failed.",
    });

    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await semanticSearchCastsTool.tool.execute!({ query: "test" }, context);
    expect(result).toEqual({
      error: "Tool request failed.",
    });
  });

  it("returns the tool prompt", async () => {
    const prompt = await semanticSearchCastsTool.prompt();
    expect(prompt).toContain("Semantic Search Casts Tool");
  });
});
