import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCobuildAiContextFresh,
  formatCobuildAiContextError,
  getCobuildAiContextSnapshot,
  getCobuildAiContextUrl,
} from "../../src/infra/cobuild-ai-context";
import {
  onchainParticipants,
  onchainPayEvents,
  onchainProjects,
  onchainRulesets,
  tokenMetadata,
} from "../../src/infra/db/schema";
import { queueCobuildDbResponse, resetAllMocks, setCobuildDbResponse } from "../utils/mocks/db";
import { resetCacheMocks } from "../utils/mocks/cache";

describe("cobuild ai context", () => {
  beforeEach(() => {
    resetAllMocks();
    resetCacheMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats errors consistently", () => {
    expect(formatCobuildAiContextError(new Error("boom"))).toBe("boom");
    expect(formatCobuildAiContextError("fail")).toBe("fail");
    expect(formatCobuildAiContextError({})).toBe("Unknown error");
    expect(formatCobuildAiContextError("x".repeat(200))).toHaveLength(120);
    expect(getCobuildAiContextUrl()).toBe("/api/cobuild/ai-context");
  });

  it("derives a snapshot from local chat-api data sources", async () => {
    setCobuildDbResponse(onchainProjects, [
      {
        suckerGroupId: "group-1",
        accountingToken: "0xabc",
        accountingDecimals: 18,
        accountingTokenSymbol: "ETH",
        erc20Symbol: "COBUILD",
        currentRulesetId: 1n,
        erc20Supply: "100000000000000000000",
      },
    ]);
    setCobuildDbResponse(tokenMetadata, [{ priceUsdc: "2000" }]);
    queueCobuildDbResponse(onchainPayEvents, [{ lifetimeAmountRaw: "50000000000000000000" }]);
    queueCobuildDbResponse(onchainPayEvents, [
      {
        timestamp: Math.floor(new Date("2026-03-01T12:00:00.000Z").getTime() / 1000),
        payer: "0x1",
        amount: "1000000000000000000",
        newlyIssuedTokenCount: "1000000000000000000",
        effectiveTokenCount: "10000000000000000000",
      },
      {
        timestamp: Math.floor(new Date("2026-02-20T12:00:00.000Z").getTime() / 1000),
        payer: "0x2",
        amount: "2000000000000000000",
        newlyIssuedTokenCount: "2000000000000000000",
        effectiveTokenCount: "20000000000000000000",
      },
    ]);
    queueCobuildDbResponse(onchainParticipants, [
      { total: 12, newLast6h: 1, newLast24h: 2, newLast7d: 3, newLast30d: 4 },
    ]);
    queueCobuildDbResponse(onchainParticipants, [
      { balance: "30000000000000000000" },
      { balance: "10000000000000000000" },
    ]);
    queueCobuildDbResponse(onchainRulesets, [
      {
        rulesetId: 1n,
        start: 1_700_000_000n,
        weight: "5",
        reservedPercent: 5000,
        cashOutTaxRate: 2500,
      },
    ]);
    queueCobuildDbResponse(onchainRulesets, [
      {
        rulesetId: 2n,
        start: 1_800_000_000n,
        weight: "4",
      },
    ]);
    queueCobuildDbResponse(onchainRulesets, [{ count: 1 }]);

    const snapshot = await fetchCobuildAiContextFresh();

    expect(snapshot.prompt).toContain("/api/cobuild/ai-context");
    expect(snapshot.data.baseAsset.symbol).toBe("ETH");
    expect(snapshot.data.baseAsset.priceUsd).toBe(2000);
    expect(snapshot.data.treasury.inflow.lifetime).toBe(50);
    expect(snapshot.data.mints.count.last30d).toBe(2);
    expect(snapshot.data.holders.total).toBe(12);
    expect(snapshot.data.distribution.top10Tokens).toBe(40);
    expect(snapshot.data.issuance.currentPrice.basePerToken).toBeCloseTo(0.2, 6);
  });

  it("returns an error when derivation fails", async () => {
    setCobuildDbResponse(onchainProjects, []);
    const snapshot = await getCobuildAiContextSnapshot();
    expect(snapshot.data).toBeNull();
    expect(snapshot.error).toContain("project not found");
  });

  it("handles sparse mint/distribution data without numeric artifacts", async () => {
    setCobuildDbResponse(onchainProjects, [
      {
        suckerGroupId: "group-1",
        accountingToken: "0xabc",
        accountingDecimals: 18,
        accountingTokenSymbol: "ETH",
        erc20Symbol: "COBUILD",
        currentRulesetId: 1n,
        erc20Supply: "100000000000000000000",
      },
    ]);
    setCobuildDbResponse(tokenMetadata, [{ priceUsdc: null }]);
    queueCobuildDbResponse(onchainPayEvents, [{ lifetimeAmountRaw: "0" }]);
    queueCobuildDbResponse(onchainPayEvents, [
      {
        timestamp: Math.floor(new Date("2026-03-01T12:00:00.000Z").getTime() / 1000),
        payer: "0x1",
        amount: "not-a-number",
        newlyIssuedTokenCount: "1",
        effectiveTokenCount: "0",
      },
    ]);
    queueCobuildDbResponse(onchainParticipants, [
      { total: 0, newLast6h: 0, newLast24h: 0, newLast7d: 0, newLast30d: 0 },
    ]);
    queueCobuildDbResponse(onchainParticipants, []);
    queueCobuildDbResponse(onchainRulesets, [
      {
        rulesetId: 1n,
        start: 1_700_000_000n,
        weight: "5",
        reservedPercent: 5000,
        cashOutTaxRate: 2500,
      },
    ]);
    queueCobuildDbResponse(onchainRulesets, []);
    queueCobuildDbResponse(onchainRulesets, [{ count: 0 }]);

    const snapshot = await fetchCobuildAiContextFresh();

    expect(snapshot.data.mints.count.last30d).toBe(0);
    expect(snapshot.data.mints.medianPrice.last30d?.basePerToken ?? null).toBeNull();
    expect(snapshot.data.distribution.top10Tokens).toBeNull();
    expect(snapshot.data.distribution.top10Share).toBeNull();
  });
});
