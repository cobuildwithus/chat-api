import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { getDiscussionThreadTool } from "../../../src/ai/tools/get-discussion-thread/get-discussion-thread";
import { executeTool } from "../../../src/tools/registry";

vi.mock("../../../src/tools/registry", () => ({
  executeTool: vi.fn(),
  resolveToolExposure: vi.fn(() => "chat-safe"),
  resolveToolInputSchema: vi.fn(() => ({})),
}));

describe("getDiscussionThreadTool", () => {
  it("returns canonical tool output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: true,
      name: "get-discussion-thread",
      output: { root: { hash: "0xabc" }, replies: [] },
    });

    const input = { rootHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", page: 1 };
    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await getDiscussionThreadTool.tool.execute!(input, context);
    expect(result).toEqual({ root: { hash: "0xabc" }, replies: [] });
    expect(executeTool).toHaveBeenCalledWith("get-discussion-thread", input);
  });

  it("returns canonical tool errors as structured output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 404,
      error: "Discussion thread not found.",
    });

    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await getDiscussionThreadTool.tool.execute!(
      { rootHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      context,
    );
    expect(result).toEqual({ error: "Discussion thread not found." });
  });

  it("returns the tool prompt", async () => {
    const prompt = await getDiscussionThreadTool.prompt();
    expect(prompt).toContain("Get Discussion Thread Tool");
  });
});
