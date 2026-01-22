import { describe, expect, it, vi } from "vitest";
import { getCastTool } from "../../../src/ai/tools/get-cast/get-cast";
import { neynarClientNotifications } from "../../../src/infra/neynar/client";

vi.mock("../../../src/infra/neynar/client", () => ({
  neynarClientNotifications: {
    lookupCastByHashOrUrl: vi.fn(),
  },
}));

describe("getCastTool", () => {
  it("returns cast data on success", async () => {
    vi.mocked(neynarClientNotifications.lookupCastByHashOrUrl).mockResolvedValue({
      cast: { hash: "0xabc" },
    } as any);

    const result = await getCastTool.tool.execute!(
      { identifier: "0xabc", type: "hash" } as any,
      {} as any,
    );
    expect(result).toEqual({ hash: "0xabc" });
  });

  it("returns null on error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(neynarClientNotifications.lookupCastByHashOrUrl).mockRejectedValue(new Error("fail"));

    const result = await getCastTool.tool.execute!(
      { identifier: "0xabc", type: "hash" } as any,
      {} as any,
    );
    expect(result).toBeNull();
    errorSpy.mockRestore();
  });

  it("returns the tool prompt", async () => {
    const prompt = await getCastTool.prompt();
    expect(prompt).toContain("Get Cast Tool");
  });
});
