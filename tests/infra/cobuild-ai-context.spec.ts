import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCobuildAiContextFresh,
  getCobuildAiContextSnapshot,
  getCobuildAiContextUrl,
} from "../../src/infra/cobuild-ai-context";
import { formatErrorLogMessage, formatErrorMessage } from "../../src/infra/errors";
import { getRevnetIssuanceTermsSnapshot } from "../../src/infra/revnet-issuance-terms";
import {
  onchainParticipants,
  onchainPayEvents,
  onchainProjects,
  onchainRulesets,
  tokenMetadata,
} from "../../src/infra/db/schema";
import { queueCobuildDbResponse, resetAllMocks, setCobuildDbResponse } from "../utils/mocks/db";
import { resetCacheMocks } from "../utils/mocks/cache";

type DrizzleCondition = {
  kind: "and" | "eq";
  args: unknown[];
};

async function captureSelectedProjectId(params: {
  envProjectId?: string;
  wireProjectId: number;
}): Promise<number> {
  const capturedConditions: DrizzleCondition[] = [];
  const originalEnv = process.env;

  vi.resetModules();
  process.env = { ...originalEnv };
  if (params.envProjectId === undefined) {
    delete process.env.COBUILD_JUICEBOX_PROJECT_ID;
  } else {
    process.env.COBUILD_JUICEBOX_PROJECT_ID = params.envProjectId;
  }

  vi.doMock("@cobuild/wire", async () => {
    const actual = await vi.importActual<typeof import("@cobuild/wire")>("@cobuild/wire");
    return {
      ...actual,
      COBUILD_PROJECT_ID: params.wireProjectId,
    };
  });
  vi.doMock("drizzle-orm", async () => {
    const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
    return {
      ...actual,
      and: (...args: unknown[]) => ({ kind: "and", args }),
      eq: (...args: unknown[]) => ({ kind: "eq", args }),
    };
  });
  vi.doMock("../../src/infra/db/cobuildDb", () => ({
    cobuildDb: {
      select: () => ({
        from: () => ({
          where: (condition: DrizzleCondition) => {
            capturedConditions.push(condition);
            const chain = {
              limit: () => chain,
              orderBy: () => chain,
              then: (resolve: (rows: unknown[]) => unknown) => resolve([]),
            };
            return chain;
          },
        }),
      }),
    },
  }));

  try {
    const isolatedModule = await import("../../src/infra/cobuild-ai-context");
    await expect(isolatedModule.fetchCobuildAiContextFresh()).rejects.toThrow(
      "Cobuild Juicebox project not found.",
    );
  } finally {
    process.env = originalEnv;
  }

  const projectQuery = capturedConditions[0];
  if (!projectQuery || projectQuery.kind !== "and") {
    throw new Error("Expected project query condition to be captured.");
  }

  const projectIdCondition = projectQuery.args[1] as DrizzleCondition | undefined;
  if (!projectIdCondition || projectIdCondition.kind !== "eq") {
    throw new Error("Expected project-id equality condition to be captured.");
  }

  return Number(projectIdCondition.args[1]);
}

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
    expect(formatErrorMessage(new Error("boom"))).toBe("Request failed.");
    expect(formatErrorMessage("fail", 120, "Cobuild AI context unavailable.")).toBe(
      "Cobuild AI context unavailable.",
    );
    expect(formatErrorLogMessage(new Error("boom"))).toBe("boom");
    expect(formatErrorLogMessage("fail")).toBe("fail");
    expect(formatErrorLogMessage({})).toBe("Unknown error");
    expect(formatErrorMessage("x".repeat(200), 120, "y".repeat(200))).toHaveLength(120);
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
    setCobuildDbResponse(onchainRulesets, [
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 1n,
        start: 1_700_000_000n,
        duration: 0n,
        weight: "5000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 5000,
        cashOutTaxRate: 2500,
      },
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 2n,
        start: 1_800_000_000n,
        duration: 0n,
        weight: "4000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 5000,
        cashOutTaxRate: 2500,
      },
    ]);

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

  it("keeps issuance summary parity with the canonical revnet snapshot at the same timestamp", async () => {
    const stage2StartSec = Math.floor(new Date("2026-02-28T00:00:00.000Z").getTime() / 1000);
    const stage3StartSec = Math.floor(new Date("2026-03-02T12:00:00.000Z").getTime() / 1000);
    const nowMs = Date.now();

    setCobuildDbResponse(onchainProjects, [
      {
        suckerGroupId: null,
        accountingToken: "0xabc",
        accountingDecimals: 6,
        accountingTokenSymbol: "USDC",
        erc20Symbol: "COBUILD",
        currentRulesetId: 22n,
        erc20Supply: "100000000000000000000",
      },
    ]);
    setCobuildDbResponse(tokenMetadata, [{ priceUsdc: "1" }]);
    queueCobuildDbResponse(onchainPayEvents, [{ lifetimeAmountRaw: "0" }]);
    queueCobuildDbResponse(onchainPayEvents, []);
    queueCobuildDbResponse(onchainParticipants, [
      { total: 0, newLast6h: 0, newLast24h: 0, newLast7d: 0, newLast30d: 0 },
    ]);
    queueCobuildDbResponse(onchainParticipants, []);
    setCobuildDbResponse(onchainRulesets, [
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 21n,
        start: 1_700_000_000n,
        duration: 0n,
        weight: "6000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 2000,
        cashOutTaxRate: 500,
      },
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 22n,
        start: BigInt(stage2StartSec),
        duration: 86_400n,
        weight: "5000000000000000000",
        weightCutPercent: 100000000,
        reservedPercent: 2500,
        cashOutTaxRate: 1000,
      },
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 23n,
        start: BigInt(stage3StartSec),
        duration: 0n,
        weight: "3000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 3000,
        cashOutTaxRate: 1200,
      },
    ]);

    const canonicalSnapshot = await getRevnetIssuanceTermsSnapshot({
      chainId: 8453,
      projectId: 138,
      nowMs,
    });
    const aiContext = await fetchCobuildAiContextFresh();

    expect(canonicalSnapshot.summary.activeStage).toBe(2);
    expect(canonicalSnapshot.summary.nextStage).toBe(3);
    expect(aiContext.data.issuance).toEqual({
      currentPrice: canonicalSnapshot.summary.currentPrice,
      nextPrice: canonicalSnapshot.summary.nextPrice,
      nextChangeAt: canonicalSnapshot.summary.nextChangeAt,
      nextChangeType: canonicalSnapshot.summary.nextChangeType,
      activeStage: canonicalSnapshot.summary.activeStage,
      nextStage: canonicalSnapshot.summary.nextStage,
      reservedPercent: canonicalSnapshot.summary.reservedPercent,
      cashOutTaxRate: canonicalSnapshot.summary.cashOutTaxRate,
    });
  });

  it("returns an error when derivation fails", async () => {
    setCobuildDbResponse(onchainProjects, []);
    const snapshot = await getCobuildAiContextSnapshot();
    expect(snapshot.data).toBeNull();
    expect(snapshot.error).toBe("Cobuild AI context unavailable.");
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
    setCobuildDbResponse(onchainRulesets, [
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 1n,
        start: 1_700_000_000n,
        duration: 0n,
        weight: "5000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 5000,
        cashOutTaxRate: 2500,
      },
    ]);

    const snapshot = await fetchCobuildAiContextFresh();

    expect(snapshot.data.mints.count.last30d).toBe(0);
    expect(snapshot.data.mints.medianPrice.last30d?.basePerToken ?? null).toBeNull();
    expect(snapshot.data.distribution.top10Tokens).toBeNull();
    expect(snapshot.data.distribution.top10Share).toBeNull();
  });

  it("drops scaled values that exceed JS safe integer range instead of returning imprecise numbers", async () => {
    setCobuildDbResponse(onchainProjects, [
      {
        suckerGroupId: "group-1",
        accountingToken: "0xabc",
        accountingDecimals: 18,
        accountingTokenSymbol: "ETH",
        erc20Symbol: "COBUILD",
        currentRulesetId: 1n,
        erc20Supply: "9007199254740992000000000000000000",
      },
    ]);
    setCobuildDbResponse(tokenMetadata, [{ priceUsdc: "2000" }]);
    queueCobuildDbResponse(onchainPayEvents, [
      { lifetimeAmountRaw: "9007199254740992000000000000000000" },
    ]);
    queueCobuildDbResponse(onchainPayEvents, []);
    queueCobuildDbResponse(onchainParticipants, [
      { total: 0, newLast6h: 0, newLast24h: 0, newLast7d: 0, newLast30d: 0 },
    ]);
    queueCobuildDbResponse(onchainParticipants, []);
    setCobuildDbResponse(onchainRulesets, [
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 1n,
        start: 1_700_000_000n,
        duration: 0n,
        weight: "5000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 5000,
        cashOutTaxRate: 2500,
      },
    ]);

    const snapshot = await fetchCobuildAiContextFresh();

    expect(snapshot.data.treasury.inflow.lifetime).toBeNull();
    expect(snapshot.data.distribution.totalSupply).toBeNull();
  });

  it("drops aggregated holder balances that would overflow JS precision even when each row is individually safe", async () => {
    setCobuildDbResponse(onchainProjects, [
      {
        suckerGroupId: "group-1",
        accountingToken: "0xabc",
        accountingDecimals: 18,
        accountingTokenSymbol: "ETH",
        erc20Symbol: "COBUILD",
        currentRulesetId: 1n,
        erc20Supply: "90071992547409910000000000000000000",
      },
    ]);
    setCobuildDbResponse(tokenMetadata, [{ priceUsdc: "2000" }]);
    queueCobuildDbResponse(onchainPayEvents, [{ lifetimeAmountRaw: "50000000000000000000" }]);
    queueCobuildDbResponse(onchainPayEvents, []);
    queueCobuildDbResponse(onchainParticipants, [
      { total: 10, newLast6h: 0, newLast24h: 0, newLast7d: 0, newLast30d: 0 },
    ]);
    queueCobuildDbResponse(onchainParticipants, Array.from({ length: 10 }, () => ({
      balance: "9007199254740991000000000000000000",
    })));
    setCobuildDbResponse(onchainRulesets, [
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 1n,
        start: 1_700_000_000n,
        duration: 0n,
        weight: "5000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 5000,
        cashOutTaxRate: 2500,
      },
    ]);

    const snapshot = await fetchCobuildAiContextFresh();

    expect(snapshot.data.distribution.top1Tokens).toBe(9007199254740991);
    expect(snapshot.data.distribution.top10Tokens).toBeNull();
    expect(snapshot.data.distribution.top10Share).toBeNull();
  });

  it("returns a cached snapshot with fractional conversions and stage transitions", async () => {
    setCobuildDbResponse(onchainProjects, [
      {
        suckerGroupId: null,
        accountingToken: "0xabc",
        accountingDecimals: 6,
        accountingTokenSymbol: "USDC",
        erc20Symbol: "COBUILD",
        currentRulesetId: 1n,
        erc20Supply: "2500000",
      },
    ]);
    setCobuildDbResponse(tokenMetadata, [{ priceUsdc: "1" }]);
    queueCobuildDbResponse(onchainPayEvents, [{ lifetimeAmountRaw: "1500000" }]);
    queueCobuildDbResponse(onchainPayEvents, [
      {
        timestamp: Math.floor(new Date("2026-03-01T23:00:00.000Z").getTime() / 1000),
        payer: "0x1",
        amount: "1500000",
        newlyIssuedTokenCount: "1",
        effectiveTokenCount: "3000000000000000000",
      },
    ]);
    queueCobuildDbResponse(onchainParticipants, [
      { total: 1, newLast6h: 1, newLast24h: 1, newLast7d: 1, newLast30d: 1 },
    ]);
    queueCobuildDbResponse(onchainParticipants, [{ balance: "2500000000000000000" }]);
    setCobuildDbResponse(onchainRulesets, [
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 1n,
        start: 1_700_000_000n,
        duration: 0n,
        weight: "5000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 2500,
        cashOutTaxRate: 1000,
      },
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 2n,
        start: 1_800_000_000n,
        duration: 0n,
        weight: "5000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 2500,
        cashOutTaxRate: 1000,
      },
    ]);

    const snapshot = await getCobuildAiContextSnapshot();

    expect(snapshot.error).toBeUndefined();
    expect(snapshot.data).not.toBeNull();
    expect(snapshot.data?.data.treasury.inflow.lifetime).toBe(1.5);
    expect(snapshot.data?.data.treasury.balance.usd).toBe(1.5);
    expect(snapshot.data?.data.mints.medianPrice.last30d?.basePerToken).toBe(0.5);
    expect(snapshot.data?.data.issuance.nextChangeType).toBe("stage");
    expect(snapshot.data?.data.issuance.nextStage).toBe(2);
  });

  it("derives staged price transitions and null holder counters when holder aggregates are missing", async () => {
    setCobuildDbResponse(onchainProjects, [
      {
        suckerGroupId: null,
        accountingToken: "0xabc",
        accountingDecimals: 6,
        accountingTokenSymbol: "USDC",
        erc20Symbol: "COBUILD",
        currentRulesetId: 11n,
        erc20Supply: "5000000000000000000",
      },
    ]);
    setCobuildDbResponse(tokenMetadata, [{ priceUsdc: "1" }]);
    queueCobuildDbResponse(onchainPayEvents, [{ lifetimeAmountRaw: "4200000" }]);
    queueCobuildDbResponse(onchainPayEvents, [
      {
        timestamp: Math.floor(new Date("2026-03-01T22:00:00.000Z").getTime() / 1000),
        payer: "0x1",
        amount: "2100000",
        newlyIssuedTokenCount: "1",
        effectiveTokenCount: "1000000000000000000",
      },
    ]);
    queueCobuildDbResponse(onchainParticipants, []);
    queueCobuildDbResponse(onchainParticipants, [
      { balance: "1000000000000000000" },
    ]);
    setCobuildDbResponse(onchainRulesets, [
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 11n,
        start: 1_700_000_000n,
        duration: 0n,
        weight: "5000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 2500,
        cashOutTaxRate: 1000,
      },
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 12n,
        start: 1_800_000_000n,
        duration: 0n,
        weight: "5000000000000000000",
        weightCutPercent: 0,
        reservedPercent: 2500,
        cashOutTaxRate: 1000,
      },
    ]);

    const snapshot = await fetchCobuildAiContextFresh();

    expect(snapshot.data.issuance.nextChangeType).toBe("stage");
    expect(snapshot.data.issuance.activeStage).toBe(1);
    expect(snapshot.data.issuance.nextStage).toBe(2);
    expect(snapshot.data.holders.total).toBeNull();
    expect(snapshot.data.holders.new).toEqual({
      last6h: null,
      last24h: null,
      last7d: null,
      last30d: null,
    });
  });

  it("supports zero-decimal accounting values and non-positive ruleset weights", async () => {
    setCobuildDbResponse(onchainProjects, [
      {
        suckerGroupId: "group-1",
        accountingToken: "0xabc",
        accountingDecimals: 0,
        accountingTokenSymbol: "POINTS",
        erc20Symbol: "COBUILD",
        currentRulesetId: 1n,
        erc20Supply: "0",
      },
    ]);
    setCobuildDbResponse(tokenMetadata, [{ priceUsdc: null }]);
    queueCobuildDbResponse(onchainPayEvents, [{ lifetimeAmountRaw: "-42" }]);
    queueCobuildDbResponse(onchainPayEvents, []);
    queueCobuildDbResponse(onchainParticipants, [
      { total: 0, newLast6h: 0, newLast24h: 0, newLast7d: 0, newLast30d: 0 },
    ]);
    queueCobuildDbResponse(onchainParticipants, []);
    setCobuildDbResponse(onchainRulesets, [
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 1n,
        start: 1_700_000_000n,
        duration: 0n,
        weight: "0",
        weightCutPercent: 0,
        reservedPercent: 0,
        cashOutTaxRate: 0,
      },
      {
        chainId: 8453,
        projectId: 138,
        rulesetId: 2n,
        start: 1_800_000_000n,
        duration: 0n,
        weight: "0",
        weightCutPercent: 0,
        reservedPercent: 0,
        cashOutTaxRate: 0,
      },
    ]);

    const snapshot = await fetchCobuildAiContextFresh();

    expect(snapshot.data.treasury.balance.base).toBe(-42);
    expect(snapshot.data.treasury.balance.usd).toBeNull();
    expect(snapshot.data.issuance.currentPrice.basePerToken).toBeNull();
    expect(snapshot.data.issuance.nextPrice.basePerToken).toBeNull();
    expect(snapshot.data.issuance.nextChangeType).toBe("stage");
    expect(snapshot.data.issuance.activeStage).toBe(1);
  });

  it("prefers the env project id over the wire fallback", async () => {
    const selectedProjectId = await captureSelectedProjectId({
      envProjectId: "777",
      wireProjectId: 138,
    });

    expect(selectedProjectId).toBe(777);
  });

  it("uses the wire project id when no env override is configured", async () => {
    const selectedProjectId = await captureSelectedProjectId({
      wireProjectId: 138,
    });

    expect(selectedProjectId).toBe(138);
  });
});
