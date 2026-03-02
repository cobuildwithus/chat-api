import { describe, expect, it, vi } from "vitest";
import { cobuildAiContextPrompt } from "../../../src/ai/prompts/cobuild-ai-context";
import type { CobuildAiContextResponse } from "../../../src/infra/cobuild-ai-context";
import { getCobuildAiContextSnapshot } from "../../../src/infra/cobuild-ai-context";

vi.mock("../../../src/infra/cobuild-ai-context", () => ({
  getCobuildAiContextSnapshot: vi.fn(),
  getCobuildAiContextUrl: vi.fn(() => "https://context.example.com/api/cobuild/ai-context"),
}));

describe("cobuildAiContextPrompt", () => {
  const buildContextResponse = (prompt: string) =>
    ({
      goalAddress: "",
      asOf: "2026-03-02T00:00:00.000Z",
      asOfMs: 1_700_000_000_000,
      prompt,
      data: {
        baseAsset: { symbol: "ETH", decimals: 18, priceUsd: null },
        token: { symbol: "COBUILD", decimals: 18 },
        treasury: {
          balance: { base: null, usd: null },
          inflow: { lifetime: null, last6h: null, last24h: null, last7d: null, last30d: null },
          paceWeekly: { last7d: null, last30d: null },
        },
        issuance: {
          currentPrice: { basePerToken: null, usdPerToken: null },
          nextPrice: { basePerToken: null, usdPerToken: null },
          nextChangeAt: null,
          nextChangeType: null,
          activeStage: null,
          nextStage: null,
          reservedPercent: null,
          cashOutTaxRate: null,
        },
        mints: {
          count: { last6h: 0, last24h: 0, last7d: 0, last30d: 0 },
          uniqueMinters: { last6h: 0, last24h: 0, last7d: 0, last30d: 0 },
          medianPrice: {
            last6h: { basePerToken: null, usdPerToken: null },
            last24h: { basePerToken: null, usdPerToken: null },
            last7d: { basePerToken: null, usdPerToken: null },
            last30d: { basePerToken: null, usdPerToken: null },
          },
          medianSize: {
            last6h: { tokens: null },
            last24h: { tokens: null },
            last7d: { tokens: null },
            last30d: { tokens: null },
          },
        },
        holders: {
          total: null,
          new: { last6h: null, last24h: null, last7d: null, last30d: null },
          medianContribution: { base: null, usd: null },
        },
        distribution: {
          totalSupply: null,
          top10Tokens: null,
          top1Tokens: null,
          top10Share: null,
          top1Share: null,
        },
      },
      extra: true,
    }) as unknown as CobuildAiContextResponse;

  it("returns fallback message when snapshot fails", async () => {
    vi.mocked(getCobuildAiContextSnapshot).mockResolvedValue({ data: null, error: "down" });

    const prompt = await cobuildAiContextPrompt();
    expect(prompt).toContain("Treasury stats unavailable: down");
  });

  it("returns formatted snapshot when data is present", async () => {
    vi.mocked(getCobuildAiContextSnapshot).mockResolvedValue({
      data: buildContextResponse("hello"),
    });

    const prompt = await cobuildAiContextPrompt();
    expect(prompt).toContain("Treasury stats (snapshot)");
    expect(prompt).toContain("hello");
    expect(prompt).toContain("\"extra\": true");
  });

  it("falls back to unavailable prompt text when prompt is empty", async () => {
    vi.mocked(getCobuildAiContextSnapshot).mockResolvedValue({
      data: buildContextResponse("   "),
    });

    const prompt = await cobuildAiContextPrompt();
    expect(prompt).toContain("Unavailable.");
  });
});
