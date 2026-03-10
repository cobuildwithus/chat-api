import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { listDiscussionsTool } from "../../../src/ai/tools/list-discussions/list-discussions";
import { executeTool } from "../../../src/tools/registry";

vi.mock("../../../src/tools/registry", () => ({
  executeTool: vi.fn(),
  resolveToolExposure: vi.fn(() => "chat-safe"),
  resolveToolInputSchema: vi.fn(() => ({})),
}));

describe("listDiscussionsTool", () => {
  it("returns canonical tool output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: true,
      name: "list-discussions",
      output: { items: [{ hash: "0xabc" }], hasMore: false },
    });

    const input = { limit: 5, sort: "last" as const };
    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await listDiscussionsTool.tool.execute!(input, context);
    expect(result).toEqual({ items: [{ hash: "0xabc" }], hasMore: false });
    expect(executeTool).toHaveBeenCalledWith("list-discussions", input);
  });

  it("returns canonical tool errors as structured output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: false,
      name: "list-discussions",
      statusCode: 400,
      error: "limit must be between 1 and 50.",
    });

    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await listDiscussionsTool.tool.execute!({ limit: 0 }, context);
    expect(result).toEqual({ error: "limit must be between 1 and 50." });
  });

  it("returns the tool prompt", async () => {
    const prompt = await listDiscussionsTool.prompt();
    expect(prompt).toContain("List Discussions Tool");
  });
});
