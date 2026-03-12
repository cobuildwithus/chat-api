import { COBUILD_PROJECT_ID as WIRE_COBUILD_PROJECT_ID } from "@cobuild/wire";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getOrSetCachedResultWithLock } from "./cache/cacheResult";
import { formatErrorLogMessage, formatErrorMessage } from "./errors";
import { getRevnetIssuanceTermsSnapshot } from "./revnet-issuance-terms";
import {
  onchainParticipants,
  onchainPayEvents,
  onchainProjects,
  tokenMetadata,
} from "./db/schema";
import { cobuildDb } from "./db/cobuildDb";

const CACHE_PREFIX = "cobuild:ai-context:";
const CACHE_KEY = "snapshot";
const CACHE_TTL_SECONDS = 60 * 15;
const COBUILD_CHAIN_ID = Number(process.env.COBUILD_CHAIN_ID ?? "8453");
const COBUILD_PROJECT_ID = Number(process.env.COBUILD_JUICEBOX_PROJECT_ID ?? WIRE_COBUILD_PROJECT_ID);
const JB_TOKEN_DECIMALS = 18;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

type WindowStats<T> = {
  last6h: T | null;
  last24h: T | null;
  last7d: T | null;
  last30d: T | null;
};

export type CobuildAiContextResponse = {
  goalAddress: string;
  asOf: string;
  asOfMs: number;
  prompt: string;
  data: {
    baseAsset: {
      symbol: string;
      decimals: number;
      priceUsd: number | null;
    };
    token: {
      symbol: string;
      decimals: number;
    };
    treasury: {
      balance: { base: number | null; usd: number | null };
      inflow: {
        lifetime: number | null;
        last6h: number | null;
        last24h: number | null;
        last7d: number | null;
        last30d: number | null;
      };
      paceWeekly: { last7d: number | null; last30d: number | null };
    };
    issuance: {
      currentPrice: { basePerToken: number | null; usdPerToken: number | null };
      nextPrice: { basePerToken: number | null; usdPerToken: number | null };
      nextChangeAt: number | null;
      nextChangeType: "cut" | "stage" | null;
      activeStage: number | null;
      nextStage: number | null;
      reservedPercent: number | null;
      cashOutTaxRate: number | null;
    };
    mints: {
      count: WindowStats<number>;
      uniqueMinters: WindowStats<number>;
      medianPrice: WindowStats<{ basePerToken: number | null; usdPerToken: number | null }>;
      medianSize: WindowStats<{ tokens: number | null }>;
    };
    holders: {
      total: number | null;
      new: WindowStats<number>;
      medianContribution: { base: number | null; usd: number | null };
    };
    distribution: {
      totalSupply: number | null;
      top10Tokens: number | null;
      top1Tokens: number | null;
      top10Share: number | null;
      top1Share: number | null;
    };
  };
};

export function getCobuildAiContextUrl(): string {
  return "/api/cobuild/ai-context";
}

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return null;
  return asNumber;
}

function toIntegerString(value: unknown): string | null {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      return null;
    }
    return Math.trunc(value).toString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return /^-?\d+$/.test(trimmed) ? trimmed : null;
  }
  return null;
}

function fromBaseUnits(value: unknown, decimals: number): number | null {
  const raw = toIntegerString(value);
  if (raw === null) return null;

  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;
  if (!digits) return null;

  const padded = digits.padStart(decimals + 1, "0");
  const wholeDigits = decimals > 0 ? padded.slice(0, padded.length - decimals) : padded;
  const fractionalDigits = decimals > 0 ? padded.slice(-decimals).replace(/0+$/, "") : "";
  const whole = wholeDigits === "" ? "0" : wholeDigits.replace(/^0+(?=\d)/, "");
  const wholeValue = BigInt(`${negative ? "-" : ""}${whole}`);
  if (wholeValue > MAX_SAFE_INTEGER_BIGINT || wholeValue < MIN_SAFE_INTEGER_BIGINT) {
    return null;
  }

  const normalized = fractionalDigits
    ? `${negative ? "-" : ""}${whole}.${fractionalDigits}`
    : `${negative ? "-" : ""}${whole}`;
  const asNumber = Number(normalized);
  return Number.isFinite(asNumber) ? asNumber : null;
}

function sumBaseUnits(values: unknown[], decimals: number): number | null {
  let total = 0n;
  let hasValue = false;

  for (const value of values) {
    const raw = toIntegerString(value);
    if (raw === null) {
      continue;
    }
    total += BigInt(raw);
    hasValue = true;
  }

  if (!hasValue) {
    return null;
  }

  return fromBaseUnits(total, decimals);
}

function toUsd(value: number | null, priceUsd: number | null): number | null {
  if (value === null || priceUsd === null) return null;
  if (!Number.isFinite(value) || !Number.isFinite(priceUsd)) return null;
  return roundToCents(value * priceUsd);
}

function median(values: number[]): number | null {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length === 0) return null;
  const sorted = filtered.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function buildWindowCutoffs(nowSec: number) {
  return {
    last6h: nowSec - Math.floor((0.25 * DAY_MS) / 1000),
    last24h: nowSec - Math.floor(DAY_MS / 1000),
    last7d: nowSec - Math.floor((7 * DAY_MS) / 1000),
    last30d: nowSec - Math.floor((30 * DAY_MS) / 1000),
  };
}

function buildPrompt(): string {
  return [
    "Cobuild live stats",
    "",
    "Fetch: `/api/cobuild/ai-context`",
    "",
    "The response includes:",
    "- `asOf` / `asOfMs`: timestamp when stats were generated",
    "- `data`: structured stats for treasury, issuance, mints, holders, and distribution",
    "",
    "Notes:",
    "- Values are best-effort and derive from local Cobuild DB snapshots in chat-api.",
    "- `usd` values are null when a base asset price is unavailable.",
    "- Use null as unavailable/insufficient data.",
  ].join("\n");
}

async function deriveCobuildAiContext(): Promise<CobuildAiContextResponse> {
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const cutoffs = buildWindowCutoffs(nowSec);

  const [project] = await cobuildDb
    .select({
      suckerGroupId: onchainProjects.suckerGroupId,
      accountingToken: onchainProjects.accountingToken,
      accountingDecimals: onchainProjects.accountingDecimals,
      accountingTokenSymbol: onchainProjects.accountingTokenSymbol,
      erc20Symbol: onchainProjects.erc20Symbol,
      erc20Supply: onchainProjects.erc20Supply,
    })
    .from(onchainProjects)
    .where(
      and(
        eq(onchainProjects.chainId, COBUILD_CHAIN_ID),
        eq(onchainProjects.projectId, COBUILD_PROJECT_ID),
      ),
    )
    .limit(1);

  if (!project) {
    throw new Error("Cobuild Juicebox project not found.");
  }

  const [priceRow] = await cobuildDb
    .select({ priceUsdc: tokenMetadata.priceUsdc })
    .from(tokenMetadata)
    .where(
      and(
        eq(tokenMetadata.chainId, COBUILD_CHAIN_ID),
        eq(tokenMetadata.address, project.accountingToken),
      ),
    )
    .limit(1);
  const basePriceUsd = toFiniteNumber(priceRow?.priceUsdc);

  const payWhereClauses = [
    eq(onchainPayEvents.chainId, COBUILD_CHAIN_ID),
    eq(onchainPayEvents.projectId, COBUILD_PROJECT_ID),
  ];
  if (project.suckerGroupId) {
    payWhereClauses.push(eq(onchainPayEvents.suckerGroupId, project.suckerGroupId));
  }
  const payWhere = and(...payWhereClauses)!;

  const [lifetimeInflowRow] = await cobuildDb
    .select({
      lifetimeAmountRaw: sql<string>`coalesce(sum(case when ${onchainPayEvents.newlyIssuedTokenCount}::numeric > 0 then ${onchainPayEvents.amount}::numeric else 0 end), 0)::text`,
    })
    .from(onchainPayEvents)
    .where(payWhere);

  const recentPayEvents = await cobuildDb
    .select({
      timestamp: onchainPayEvents.timestamp,
      payer: onchainPayEvents.payer,
      amount: onchainPayEvents.amount,
      newlyIssuedTokenCount: onchainPayEvents.newlyIssuedTokenCount,
      effectiveTokenCount: onchainPayEvents.effectiveTokenCount,
    })
    .from(onchainPayEvents)
    .where(and(payWhere, gte(onchainPayEvents.timestamp, cutoffs.last30d)));

  const inflowSums = {
    last6h: 0,
    last24h: 0,
    last7d: 0,
    last30d: 0,
  };
  const mintCounts = {
    last6h: 0,
    last24h: 0,
    last7d: 0,
    last30d: 0,
  };
  const uniqueMinters = {
    last6h: new Set<string>(),
    last24h: new Set<string>(),
    last7d: new Set<string>(),
    last30d: new Set<string>(),
  };
  const mintPrices = {
    last6h: [] as number[],
    last24h: [] as number[],
    last7d: [] as number[],
    last30d: [] as number[],
  };
  const mintSizes = {
    last6h: [] as number[],
    last24h: [] as number[],
    last7d: [] as number[],
    last30d: [] as number[],
  };

  for (const event of recentPayEvents) {
    const timestamp = event.timestamp;
    const amountBase = fromBaseUnits(event.amount, project.accountingDecimals);
    const newlyIssuedRaw = toFiniteNumber(event.newlyIssuedTokenCount) ?? 0;
    const mintedTokens = fromBaseUnits(event.effectiveTokenCount, JB_TOKEN_DECIMALS);
    const pricePerToken =
      amountBase !== null && mintedTokens !== null && mintedTokens > 0
        ? amountBase / mintedTokens
        : null;

    const windows = [
      timestamp >= cutoffs.last6h ? "last6h" : null,
      timestamp >= cutoffs.last24h ? "last24h" : null,
      timestamp >= cutoffs.last7d ? "last7d" : null,
      timestamp >= cutoffs.last30d ? "last30d" : null,
    ].filter((window): window is keyof typeof inflowSums => Boolean(window));

    for (const window of windows) {
      if (newlyIssuedRaw > 0 && amountBase !== null) {
        inflowSums[window] += amountBase;
      }
      if (mintedTokens !== null && mintedTokens > 0) {
        mintCounts[window] += 1;
        uniqueMinters[window].add(event.payer);
        mintSizes[window].push(mintedTokens);
        if (pricePerToken !== null) {
          mintPrices[window].push(pricePerToken);
        }
      }
    }
  }

  const holderWhere = and(
    eq(onchainParticipants.chainId, COBUILD_CHAIN_ID),
    eq(onchainParticipants.projectId, COBUILD_PROJECT_ID),
  )!;
  const [holderCounts] = await cobuildDb
    .select({
      total: sql<number>`coalesce(count(*) filter (where ${onchainParticipants.balance}::numeric > 0), 0)::int`,
      newLast6h: sql<number>`coalesce(count(*) filter (where ${onchainParticipants.firstOwned} is not null and ${onchainParticipants.firstOwned} >= ${cutoffs.last6h}), 0)::int`,
      newLast24h: sql<number>`coalesce(count(*) filter (where ${onchainParticipants.firstOwned} is not null and ${onchainParticipants.firstOwned} >= ${cutoffs.last24h}), 0)::int`,
      newLast7d: sql<number>`coalesce(count(*) filter (where ${onchainParticipants.firstOwned} is not null and ${onchainParticipants.firstOwned} >= ${cutoffs.last7d}), 0)::int`,
      newLast30d: sql<number>`coalesce(count(*) filter (where ${onchainParticipants.firstOwned} is not null and ${onchainParticipants.firstOwned} >= ${cutoffs.last30d}), 0)::int`,
    })
    .from(onchainParticipants)
    .where(holderWhere);

  const topParticipants = await cobuildDb
    .select({ balance: onchainParticipants.balance })
    .from(onchainParticipants)
    .where(and(holderWhere, sql`${onchainParticipants.balance}::numeric > 0`))
    .orderBy(desc(sql`${onchainParticipants.balance}::numeric`))
    .limit(10);

  const top10TokensRaw = topParticipants.map((row) => row.balance);
  const top10TokensBase = sumBaseUnits(top10TokensRaw, JB_TOKEN_DECIMALS);
  const top1TokensBase =
    topParticipants.length > 0 ? fromBaseUnits(topParticipants[0]?.balance, JB_TOKEN_DECIMALS) : null;
  const top10Tokens = top10TokensBase !== null ? roundToCents(top10TokensBase) : null;
  const top1Tokens = top1TokensBase !== null ? roundToCents(top1TokensBase) : null;
  const totalSupply = fromBaseUnits(project.erc20Supply, JB_TOKEN_DECIMALS);
  const top10Share =
    totalSupply !== null && top10Tokens !== null && totalSupply > 0 ? top10Tokens / totalSupply : null;
  const top1Share =
    totalSupply !== null && top1Tokens !== null && totalSupply > 0 ? top1Tokens / totalSupply : null;

  const issuanceSnapshot = await getRevnetIssuanceTermsSnapshot({
    chainId: COBUILD_CHAIN_ID,
    projectId: COBUILD_PROJECT_ID,
    nowMs,
    projectMeta: {
      accountingToken: project.accountingToken,
      accountingDecimals: project.accountingDecimals,
      accountingTokenSymbol: project.accountingTokenSymbol,
      erc20Symbol: project.erc20Symbol,
    },
    basePriceUsd,
  });

  const snapshot: CobuildAiContextResponse = {
    goalAddress: "",
    asOf: new Date(nowMs).toISOString(),
    asOfMs: nowMs,
    prompt: buildPrompt(),
    data: {
      baseAsset: {
        symbol: project.accountingTokenSymbol,
        decimals: project.accountingDecimals,
        priceUsd: basePriceUsd,
      },
      token: {
        symbol: project.erc20Symbol ?? "TOKEN",
        decimals: JB_TOKEN_DECIMALS,
      },
      treasury: {
        balance: {
          base: fromBaseUnits(lifetimeInflowRow?.lifetimeAmountRaw, project.accountingDecimals),
          usd: toUsd(
            fromBaseUnits(lifetimeInflowRow?.lifetimeAmountRaw, project.accountingDecimals),
            basePriceUsd,
          ),
        },
        inflow: {
          lifetime: fromBaseUnits(lifetimeInflowRow?.lifetimeAmountRaw, project.accountingDecimals),
          last6h: roundToCents(inflowSums.last6h),
          last24h: roundToCents(inflowSums.last24h),
          last7d: roundToCents(inflowSums.last7d),
          last30d: roundToCents(inflowSums.last30d),
        },
        paceWeekly: {
          last7d: roundToCents(inflowSums.last7d),
          last30d: roundToCents(inflowSums.last30d / (30 / 7)),
        },
      },
      issuance: {
        currentPrice: issuanceSnapshot.summary.currentPrice,
        nextPrice: issuanceSnapshot.summary.nextPrice,
        nextChangeAt: issuanceSnapshot.summary.nextChangeAt,
        nextChangeType: issuanceSnapshot.summary.nextChangeType,
        activeStage: issuanceSnapshot.summary.activeStage,
        nextStage: issuanceSnapshot.summary.nextStage,
        reservedPercent: issuanceSnapshot.summary.reservedPercent,
        cashOutTaxRate: issuanceSnapshot.summary.cashOutTaxRate,
      },
      mints: {
        count: {
          last6h: mintCounts.last6h,
          last24h: mintCounts.last24h,
          last7d: mintCounts.last7d,
          last30d: mintCounts.last30d,
        },
        uniqueMinters: {
          last6h: uniqueMinters.last6h.size,
          last24h: uniqueMinters.last24h.size,
          last7d: uniqueMinters.last7d.size,
          last30d: uniqueMinters.last30d.size,
        },
        medianPrice: {
          last6h: {
            basePerToken: median(mintPrices.last6h),
            usdPerToken: toUsd(median(mintPrices.last6h), basePriceUsd),
          },
          last24h: {
            basePerToken: median(mintPrices.last24h),
            usdPerToken: toUsd(median(mintPrices.last24h), basePriceUsd),
          },
          last7d: {
            basePerToken: median(mintPrices.last7d),
            usdPerToken: toUsd(median(mintPrices.last7d), basePriceUsd),
          },
          last30d: {
            basePerToken: median(mintPrices.last30d),
            usdPerToken: toUsd(median(mintPrices.last30d), basePriceUsd),
          },
        },
        medianSize: {
          last6h: { tokens: median(mintSizes.last6h) },
          last24h: { tokens: median(mintSizes.last24h) },
          last7d: { tokens: median(mintSizes.last7d) },
          last30d: { tokens: median(mintSizes.last30d) },
        },
      },
      holders: {
        total: holderCounts?.total ?? null,
        new: {
          last6h: holderCounts?.newLast6h ?? null,
          last24h: holderCounts?.newLast24h ?? null,
          last7d: holderCounts?.newLast7d ?? null,
          last30d: holderCounts?.newLast30d ?? null,
        },
        medianContribution: {
          base: null,
          usd: null,
        },
      },
      distribution: {
        totalSupply,
        top10Tokens,
        top1Tokens,
        top10Share,
        top1Share,
      },
    },
  };

  return snapshot;
}

export async function fetchCobuildAiContextFresh(
  _timeoutMs?: number,
): Promise<CobuildAiContextResponse> {
  return deriveCobuildAiContext();
}

export async function getCobuildAiContextSnapshot(): Promise<{
  data: CobuildAiContextResponse | null;
  error?: string;
}> {
  try {
    const data = await getOrSetCachedResultWithLock(
      CACHE_KEY,
      CACHE_PREFIX,
      () => deriveCobuildAiContext(),
      CACHE_TTL_SECONDS,
    );
    return { data };
  } catch (error) {
    console.error("Cobuild AI context snapshot error:", formatErrorLogMessage(error));
    return {
      data: null,
      error: formatErrorMessage(error, undefined, "Cobuild AI context unavailable."),
    };
  }
}
