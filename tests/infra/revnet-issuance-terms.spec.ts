import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRevnetIssuanceTermsSnapshot } from "../../src/infra/revnet-issuance-terms";
import {
  onchainProjects,
  onchainRulesets,
  tokenMetadata,
} from "../../src/infra/db/schema";
import {
  getDbCallCount,
  queueCobuildDbResponse,
  resetAllMocks,
  setCobuildDbResponse,
} from "../utils/mocks/db";

describe("revnet issuance terms service", () => {
  beforeEach(() => {
    resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds indexed issuance terms from ruleset rows with in-stage cuts", async () => {
    setCobuildDbResponse(onchainProjects, [
      {
        accountingToken: "0xabc",
        accountingDecimals: 18,
        accountingTokenSymbol: "ETH",
        erc20Symbol: "COBUILD",
      },
    ]);
    setCobuildDbResponse(tokenMetadata, [{ priceUsdc: "2000" }]);
    queueCobuildDbResponse(onchainRulesets, [
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 1n,
        start: 0n,
        duration: 100n,
        weight: "2000000000000000000",
        weightCutPercent: 100000000,
        reservedPercent: 5000,
        cashOutTaxRate: 2500,
      },
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 2n,
        start: 500n,
        duration: 0n,
        weight: "1000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 4000,
        cashOutTaxRate: 2000,
      },
    ]);

    const snapshot = await getRevnetIssuanceTermsSnapshot({
      chainId: 8453,
      projectId: 138,
      nowMs: 250_000,
    });

    expect(snapshot.baseAsset).toEqual({
      address: "0xabc",
      symbol: "ETH",
      decimals: 18,
      priceUsd: 2000,
    });
    expect(snapshot.token).toEqual({
      symbol: "COBUILD",
      decimals: 18,
    });
    expect(snapshot.summary.currentIssuance).toBeCloseTo(1.62);
    expect(snapshot.summary.currentPrice.basePerToken).toBeCloseTo(0.61728395);
    expect(snapshot.summary.nextChangeType).toBe("cut");
    expect(snapshot.summary.nextChangeAt).toBe(300_000);
    expect(snapshot.summary.nextIssuance).toBeCloseTo(1.458);
    expect(snapshot.stages).toHaveLength(2);
    expect(snapshot.chartData.some((point) => point.timestamp === 300_000)).toBe(true);
  });

  it("rejects missing indexed project metadata", async () => {
    setCobuildDbResponse(onchainProjects, []);
    await expect(
      getRevnetIssuanceTermsSnapshot({
        chainId: 8453,
        projectId: 138,
      }),
    ).rejects.toThrow("Cobuild Juicebox project not found.");
  });

  it("falls back to default ids, TOKEN symbol, and null usd pricing when metadata is incomplete", async () => {
    setCobuildDbResponse(onchainProjects, [
      {
        accountingToken: "0xdef",
        accountingDecimals: 6,
        accountingTokenSymbol: "USDC",
        erc20Symbol: null,
      },
    ]);
    setCobuildDbResponse(tokenMetadata, [{ priceUsdc: "not-a-number" }]);
    setCobuildDbResponse(onchainRulesets, [
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 3n,
        start: 0n,
        duration: 0n,
        weight: "1000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 0,
        cashOutTaxRate: 0,
      },
    ]);

    const snapshot = await getRevnetIssuanceTermsSnapshot();

    expect(snapshot.chainId).toBe(8453);
    expect(snapshot.projectId).toBe(138);
    expect(snapshot.baseAsset).toEqual({
      address: "0xdef",
      symbol: "USDC",
      decimals: 6,
      priceUsd: null,
    });
    expect(snapshot.token).toEqual({
      symbol: "TOKEN",
      decimals: 18,
    });
    expect(snapshot.summary.currentPrice).toEqual({
      basePerToken: 1,
      usdPerToken: null,
    });
  });

  it("uses provided project metadata and base price overrides without reloading them", async () => {
    setCobuildDbResponse(onchainProjects, []);
    setCobuildDbResponse(tokenMetadata, []);
    setCobuildDbResponse(onchainRulesets, [
      {
        chainId: 10,
        projectId: 77,
        rulesetId: 8n,
        start: 0n,
        duration: 0n,
        weight: "4000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 2000,
        cashOutTaxRate: 1500,
      },
    ]);

    const snapshot = await getRevnetIssuanceTermsSnapshot({
      chainId: 10,
      projectId: 77,
      projectMeta: {
        accountingToken: "0x123",
        accountingDecimals: 18,
        accountingTokenSymbol: "ETH",
        erc20Symbol: null,
      },
      basePriceUsd: Number.NaN,
      nowMs: 123_000,
    });

    expect(getDbCallCount(onchainProjects)).toBe(0);
    expect(getDbCallCount(tokenMetadata)).toBe(0);
    expect(snapshot.chainId).toBe(10);
    expect(snapshot.projectId).toBe(77);
    expect(snapshot.baseAsset.priceUsd).toBeNaN();
    expect(snapshot.token.symbol).toBe("TOKEN");
    expect(snapshot.summary.currentPrice).toEqual({
      basePerToken: 0.25,
      usdPerToken: null,
    });
  });
});
