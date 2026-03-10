import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { getUser } from "../../../src/ai/tools/get-user/get-user";
import { executeTool } from "../../../src/tools/registry";

vi.mock("../../../src/tools/registry", () => ({
  executeTool: vi.fn(),
  resolveToolExposure: vi.fn(() => "chat-safe"),
  resolveToolInputSchema: vi.fn(() => ({})),
}));

describe("getUser tool", () => {
  it("returns canonical tool output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: true,
      name: "get-user",
      output: { fid: 1, fname: "alice", addresses: ["0xabc"] },
    });

    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await getUser.execute!({ fname: "alice" }, context);
    expect(result).toEqual({ fid: 1, fname: "alice", addresses: ["0xabc"] });
    expect(executeTool).toHaveBeenCalledWith("get-user", { fname: "alice" });
  });

  it("returns canonical tool errors as structured output", async () => {
    vi.mocked(executeTool).mockResolvedValue({
      ok: false,
      name: "get-user",
      statusCode: 400,
      error: "fname must not be empty.",
    });

    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await getUser.execute!({ fname: "" }, context);
    expect(result).toEqual({ error: "fname must not be empty." });
  });
});
