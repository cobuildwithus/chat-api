import {
  buildRevnetIssuanceTerms,
  COBUILD_PROJECT_ID as WIRE_COBUILD_PROJECT_ID,
  issuancePriceFromRevnetWeight,
  type RevnetIssuancePoint,
  type RevnetIssuanceStage,
} from "@cobuild/wire";
import { and, asc, eq } from "drizzle-orm";
import { cobuildDb } from "./db/cobuildDb";
import { onchainProjects, onchainRulesets, tokenMetadata } from "./db/schema";

const DEFAULT_CHAIN_ID = Number(process.env.COBUILD_CHAIN_ID ?? "8453");
const DEFAULT_PROJECT_ID = Number(process.env.COBUILD_JUICEBOX_PROJECT_ID ?? WIRE_COBUILD_PROJECT_ID);
const JB_TOKEN_DECIMALS = 18;

type RevnetProjectMeta = {
  accountingToken: string;
  accountingDecimals: number;
  accountingTokenSymbol: string;
  erc20Symbol: string | null;
};

export type RevnetIssuanceTermsSnapshot = {
  chainId: number;
  projectId: number;
  asOfMs: number;
  baseAsset: {
    address: string;
    symbol: string;
    decimals: number;
    priceUsd: number | null;
  };
  token: {
    symbol: string;
    decimals: number;
  };
  summary: {
    currentIssuance: number | null;
    nextIssuance: number | null;
    currentPrice: { basePerToken: number | null; usdPerToken: number | null };
    nextPrice: { basePerToken: number | null; usdPerToken: number | null };
    nextChangeAt: number | null;
    nextChangeType: "cut" | "stage" | null;
    reservedPercent: number | null;
    cashOutTaxRate: number | null;
    activeStage: number | null;
    nextStage: number | null;
  };
  activeStageIndex: number | null;
  stages: RevnetIssuanceStage[];
  chartData: RevnetIssuancePoint[];
  chartStart: number;
  chartEnd: number;
};

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : null;
}

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toUsd(value: number | null, priceUsd: number | null): number | null {
  if (value === null || priceUsd === null) return null;
  if (!Number.isFinite(value) || !Number.isFinite(priceUsd)) return null;
  return roundToCents(value * priceUsd);
}

async function loadProjectMeta(
  chainId: number,
  projectId: number,
): Promise<RevnetProjectMeta | null> {
  const [project] = await cobuildDb
    .select({
      accountingToken: onchainProjects.accountingToken,
      accountingDecimals: onchainProjects.accountingDecimals,
      accountingTokenSymbol: onchainProjects.accountingTokenSymbol,
      erc20Symbol: onchainProjects.erc20Symbol,
    })
    .from(onchainProjects)
    .where(
      and(
        eq(onchainProjects.chainId, chainId),
        eq(onchainProjects.projectId, projectId),
      ),
    )
    .limit(1);

  return project ?? null;
}

async function loadBasePriceUsd(chainId: number, accountingToken: string): Promise<number | null> {
  const [priceRow] = await cobuildDb
    .select({ priceUsdc: tokenMetadata.priceUsdc })
    .from(tokenMetadata)
    .where(
      and(
        eq(tokenMetadata.chainId, chainId),
        eq(tokenMetadata.address, accountingToken),
      ),
    )
    .limit(1);

  return toFiniteNumber(priceRow?.priceUsdc);
}

export async function getRevnetIssuanceTermsSnapshot(params?: {
  chainId?: number;
  projectId?: number;
  nowMs?: number;
  projectMeta?: RevnetProjectMeta;
  basePriceUsd?: number | null;
}): Promise<RevnetIssuanceTermsSnapshot> {
  const chainId = params?.chainId ?? DEFAULT_CHAIN_ID;
  const projectId = params?.projectId ?? DEFAULT_PROJECT_ID;
  const projectMeta = params?.projectMeta ?? await loadProjectMeta(chainId, projectId);
  if (!projectMeta) {
    throw new Error("Cobuild Juicebox project not found.");
  }

  const basePriceUsd =
    params?.basePriceUsd !== undefined
      ? params.basePriceUsd
      : await loadBasePriceUsd(chainId, projectMeta.accountingToken);
  const rawRulesets = await cobuildDb
    .select({
      chainId: onchainRulesets.chainId,
      projectId: onchainRulesets.projectId,
      rulesetId: onchainRulesets.rulesetId,
      start: onchainRulesets.start,
      duration: onchainRulesets.duration,
      weight: onchainRulesets.weight,
      weightCutPercent: onchainRulesets.weightCutPercent,
      reservedPercent: onchainRulesets.reservedPercent,
      cashOutTaxRate: onchainRulesets.cashOutTaxRate,
    })
    .from(onchainRulesets)
    .where(
      and(
        eq(onchainRulesets.chainId, chainId),
        eq(onchainRulesets.projectId, projectId),
      ),
    )
    .orderBy(asc(onchainRulesets.start));

  const terms = buildRevnetIssuanceTerms({
    rawRulesets: rawRulesets.map((ruleset) => ({
      chainId: Number(ruleset.chainId),
      projectId: Number(ruleset.projectId),
      rulesetId: ruleset.rulesetId,
      start: ruleset.start,
      duration: ruleset.duration,
      weight: ruleset.weight,
      weightCutPercent: ruleset.weightCutPercent,
      reservedPercent: ruleset.reservedPercent,
      cashOutTaxRate: ruleset.cashOutTaxRate,
    })),
    baseSymbol: projectMeta.accountingTokenSymbol,
    tokenSymbol: projectMeta.erc20Symbol ?? "TOKEN",
    nowMs: params?.nowMs,
    primaryChainId: chainId,
    primaryProjectId: projectId,
  });

  const currentPriceBase = issuancePriceFromRevnetWeight(terms.summary.currentIssuance);
  const nextPriceBase = issuancePriceFromRevnetWeight(terms.summary.nextIssuance);

  return {
    chainId,
    projectId,
    asOfMs: terms.now,
    baseAsset: {
      address: projectMeta.accountingToken,
      symbol: projectMeta.accountingTokenSymbol,
      decimals: projectMeta.accountingDecimals,
      priceUsd: basePriceUsd,
    },
    token: {
      symbol: projectMeta.erc20Symbol ?? "TOKEN",
      decimals: JB_TOKEN_DECIMALS,
    },
    summary: {
      currentIssuance: terms.summary.currentIssuance,
      nextIssuance: terms.summary.nextIssuance,
      currentPrice: {
        basePerToken: currentPriceBase,
        usdPerToken: toUsd(currentPriceBase, basePriceUsd),
      },
      nextPrice: {
        basePerToken: nextPriceBase,
        usdPerToken: toUsd(nextPriceBase, basePriceUsd),
      },
      nextChangeAt: terms.summary.nextChangeAt,
      nextChangeType: terms.summary.nextChangeType,
      reservedPercent: terms.summary.reservedPercent,
      cashOutTaxRate: terms.summary.cashOutTaxRate,
      activeStage: terms.summary.activeStage,
      nextStage: terms.summary.nextStage,
    },
    activeStageIndex: terms.activeStageIndex,
    stages: terms.stages,
    chartData: terms.chartData,
    chartStart: terms.chartStart,
    chartEnd: terms.chartEnd,
  };
}
