import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { replyToCastTool } from "../../../src/ai/tools/reply-to-cast/reply-to-cast";
import { executeTool } from "../../../src/api/tools/registry";

vi.mock("../../../src/api/tools/registry", () => ({
  executeTool: vi.fn(),
}));

describe("replyToCastTool", () => {
  it("returns canonical tool output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: true,
      name: "reply-to-cast",
      output: { hash: "0xabc", cast: { hash: "0xabc" } },
    });

    const input = {
      confirm: true,
      signerUuid: "8d13fd9c-1dd6-4e33-8f07-4a3cdd6e9b3b",
      text: "Thanks for sharing this update.",
      parentHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await replyToCastTool.tool.execute!(input, context);
    expect(result).toEqual({ hash: "0xabc", cast: { hash: "0xabc" } });
    expect(executeTool).toHaveBeenCalledWith("reply-to-cast", input);
  });

  it("returns canonical tool errors as structured output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: false,
      name: "reply-to-cast",
      statusCode: 400,
      error: "confirm must be true to publish a reply.",
    });

    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await replyToCastTool.tool.execute!(
      {
        confirm: false,
        signerUuid: "8d13fd9c-1dd6-4e33-8f07-4a3cdd6e9b3b",
        text: "test",
        parentHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      context,
    );
    expect(result).toEqual({ error: "confirm must be true to publish a reply." });
  });

  it("returns the tool prompt", async () => {
    const prompt = await replyToCastTool.prompt();
    expect(prompt).toContain("Reply To Cast Tool");
  });
});
