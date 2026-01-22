import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { getCastTool } from "../../../src/ai/tools/get-cast/get-cast";
import { getNeynarClient } from "../../../src/infra/neynar/client";

vi.mock("../../../src/infra/neynar/client", () => ({
  getNeynarClient: vi.fn(),
}));

describe("getCastTool", () => {
  it("returns cast data on success", async () => {
    const lookupCastByHashOrUrl = vi.fn().mockResolvedValue({
      cast: { hash: "0xabc" },
    });
    const neynarClient = { lookupCastByHashOrUrl } as unknown as NonNullable<
      ReturnType<typeof getNeynarClient>
    >;
    vi.mocked(getNeynarClient).mockReturnValue(neynarClient);

    const input = { identifier: "0xabc", type: "hash" } as const;
    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await getCastTool.tool.execute!(input, context);
    expect(result).toEqual({ hash: "0xabc" });
  });

  it("returns null on error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const lookupCastByHashOrUrl = vi.fn().mockRejectedValue(new Error("fail"));
    const neynarClient = { lookupCastByHashOrUrl } as unknown as NonNullable<
      ReturnType<typeof getNeynarClient>
    >;
    vi.mocked(getNeynarClient).mockReturnValue(neynarClient);

    const input = { identifier: "0xabc", type: "hash" } as const;
    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await getCastTool.tool.execute!(input, context);
    expect(result).toBeNull();
    errorSpy.mockRestore();
  });

  it("returns an error when api key is missing", async () => {
    vi.mocked(getNeynarClient).mockReturnValue(null);

    const input = { identifier: "0xabc", type: "hash" } as const;
    const context: { toolCallId: string; messages: ModelMessage[] } = {
      toolCallId: "tool",
      messages: [],
    };
    const result = await getCastTool.tool.execute!(input, context);
    expect(result).toEqual({ error: "Neynar API key is not configured." });
  });

  it("returns the tool prompt", async () => {
    const prompt = await getCastTool.prompt();
    expect(prompt).toContain("Get Cast Tool");
  });
});
