import { isAddress } from "viem";
import {
  buildTcrItemId,
  buildTcrRequestId,
  normalizeGoalLookupKey,
  normalizeHexAddress,
  normalizeIndexedIdentifier,
  normalizeLookupIdentifier,
} from "./identifiers";
import {
  fetchBudgetById,
  fetchBudgetByRecipientId,
  fetchBudgetGoalContextBundle,
  fetchBudgetRecipientLookup,
  fetchDisputeById,
  fetchDisputeByTcrAndDisputeId,
  fetchGoalById,
  fetchGoalRouteLookup,
  fetchGoalContextByArbitratorId,
  fetchGoalContextByBudgetTcrId,
  fetchMechanismBudgetContextByArbitratorId,
  fetchMechanismBudgetContextByTcrId,
  fetchPremiumEscrowLookupBundle,
  fetchStakeVaultById,
  fetchTcrItemById,
  fetchTcrRequestById,
} from "./batched-reads";
import type {
  ArbitratorDisputeRow,
  BudgetTreasuryRow,
  DisputeContext,
  GoalTreasuryRow,
  PremiumEscrowContext,
  StakeContext,
  TcrRequestContext,
  TcrRequestRow,
} from "./types";

export class AmbiguousGoalRouteLookupError extends Error {
  constructor(identifier: string) {
    super(`Goal identifier "${identifier}" matched multiple canonical routes.`);
    this.name = "AmbiguousGoalRouteLookupError";
  }
}

export async function resolveGoal(identifier: string): Promise<GoalTreasuryRow | null> {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0) return null;

  if (isAddress(normalized)) {
    return fetchGoalById(normalizeHexAddress(normalized));
  }

  const routeLookup = await fetchGoalRouteLookup(normalizeGoalLookupKey(normalized));
  if (routeLookup.kind === "ambiguous") {
    throw new AmbiguousGoalRouteLookupError(normalized);
  }
  return routeLookup.kind === "resolved" ? routeLookup.goalRow : null;
}

export async function resolveBudget(identifier: string): Promise<BudgetTreasuryRow | null> {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0) return null;

  if (isAddress(normalized)) {
    return fetchBudgetById(normalizeHexAddress(normalized));
  }

  if (normalized.startsWith("0x")) {
    return fetchBudgetByRecipientId(normalized.toLowerCase());
  }

  return null;
}

export async function resolveTcrRequestRow(identifier: string): Promise<TcrRequestRow | null> {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0) return null;
  return fetchTcrRequestById(normalizeIndexedIdentifier(normalized));
}

export async function resolveDisputeRow(identifier: string): Promise<ArbitratorDisputeRow | null> {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0) return null;
  return fetchDisputeById(normalizeIndexedIdentifier(normalized));
}

export async function resolveStakeContext(identifier: string): Promise<StakeContext | null> {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0) return null;

  const goalRow = await resolveGoal(identifier);
  if (goalRow) {
    const stakeVaultRow = goalRow.stakeVault ? await fetchStakeVaultById(goalRow.stakeVault) : null;
    return {
      stakeVaultRow,
      goalRow,
      budgetRow: null,
      goalAddress: goalRow.id,
      budgetAddress: null,
      stakeVaultAddress: goalRow.stakeVault ?? stakeVaultRow?.id ?? null,
    };
  }

  let budgetRow = await resolveBudget(identifier);
  if (!budgetRow && normalized.startsWith("0x")) {
    const recipientRow = await fetchBudgetRecipientLookup(normalized.toLowerCase());
    if (recipientRow?.budgetTreasury) {
      budgetRow = await fetchBudgetById(recipientRow.budgetTreasury);
    }
  }

  if (budgetRow) {
    const budgetGoalContext = await fetchBudgetGoalContextBundle(budgetRow.id);
    const stakeVaultAddress = budgetGoalContext.goalContext?.stakeVault ?? budgetGoalContext.goalRow?.stakeVault ?? null;
    const stakeVaultRow = stakeVaultAddress ? await fetchStakeVaultById(stakeVaultAddress) : null;

    return {
      stakeVaultRow,
      goalRow: budgetGoalContext.goalRow,
      budgetRow,
      goalAddress: budgetGoalContext.goalRow?.id ?? budgetGoalContext.goalAddress,
      budgetAddress: budgetRow.id,
      stakeVaultAddress,
    };
  }

  if (!normalized.startsWith("0x")) return null;

  const stakeVaultRow = await fetchStakeVaultById(normalized.toLowerCase());
  if (!stakeVaultRow) return null;

  let goalRowFromVault: GoalTreasuryRow | null = null;
  let budgetRowFromVault: BudgetTreasuryRow | null = null;
  if (stakeVaultRow.treasury) {
    if (stakeVaultRow.kind === "goal") {
      goalRowFromVault = await fetchGoalById(stakeVaultRow.treasury);
    } else if (stakeVaultRow.kind === "budget") {
      budgetRowFromVault = await fetchBudgetById(stakeVaultRow.treasury);
    }
  }

  return {
    stakeVaultRow,
    goalRow: goalRowFromVault,
    budgetRow: budgetRowFromVault,
    goalAddress: goalRowFromVault?.id ?? null,
    budgetAddress: budgetRowFromVault?.id ?? null,
    stakeVaultAddress: stakeVaultRow.id,
  };
}

export async function resolvePremiumEscrowContext(identifier: string): Promise<PremiumEscrowContext | null> {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0 || !normalized.startsWith("0x")) return null;

  const lookupKey = normalized.toLowerCase();
  const premiumLookup = await fetchPremiumEscrowLookupBundle(lookupKey);
  if (!premiumLookup) return null;

  const goalContext = premiumLookup.budgetAddress
    ? await fetchBudgetGoalContextBundle(premiumLookup.budgetAddress)
    : {
        goalRow: null,
        goalAddress: null,
      };

  return {
    premiumRow: premiumLookup.premiumRow,
    stackRow: premiumLookup.stackRow,
    budgetRow: premiumLookup.budgetRow,
    goalRow: goalContext.goalRow,
    goalAddress: goalContext.goalRow?.id ?? goalContext.goalAddress,
  };
}

export async function resolveTcrRequestContext(requestRow: TcrRequestRow): Promise<TcrRequestContext> {
  const [itemRow, budgetGoalContext, mechanismContext] = await Promise.all([
    requestRow.tcrAddress && requestRow.itemId
      ? fetchTcrItemById(buildTcrItemId(requestRow.tcrAddress, requestRow.itemId))
      : Promise.resolve(null),
    !requestRow.goalTreasury && requestRow.tcrKind === "budget" && requestRow.tcrAddress
      ? fetchGoalContextByBudgetTcrId(requestRow.tcrAddress)
      : Promise.resolve(null),
    requestRow.tcrKind === "mechanism" && requestRow.tcrAddress
      ? fetchMechanismBudgetContextByTcrId(requestRow.tcrAddress)
      : Promise.resolve(null),
  ]);

  const goalAddress =
    requestRow.goalTreasury ??
    itemRow?.goalTreasury ??
    budgetGoalContext?.goalTreasury ??
    mechanismContext?.goalTreasury ??
    null;
  const budgetAddress =
    requestRow.budgetTreasury ?? itemRow?.budgetTreasury ?? mechanismContext?.budgetTreasury ?? null;

  const [budgetRow, goalRow, disputeRow] = await Promise.all([
    budgetAddress ? fetchBudgetById(budgetAddress) : Promise.resolve(null),
    goalAddress ? fetchGoalById(goalAddress) : Promise.resolve(null),
    requestRow.disputeId && requestRow.tcrAddress
      ? fetchDisputeByTcrAndDisputeId(requestRow.tcrAddress, requestRow.disputeId)
      : Promise.resolve(null),
  ]);

  return {
    itemRow,
    mechanismContext,
    goalRow,
    budgetRow,
    disputeRow,
    goalAddress,
    budgetAddress,
  };
}

export async function resolveDisputeContext(disputeRow: ArbitratorDisputeRow): Promise<DisputeContext> {
  const [requestRow, goalContext, mechanismContext] = await Promise.all([
    disputeRow.tcrAddress && disputeRow.itemId && disputeRow.requestIndex
      ? fetchTcrRequestById(buildTcrRequestId(disputeRow.tcrAddress, disputeRow.itemId, disputeRow.requestIndex))
      : Promise.resolve(null),
    !disputeRow.goalTreasury && disputeRow.arbitrator
      ? fetchGoalContextByArbitratorId(disputeRow.arbitrator)
      : Promise.resolve(null),
    disputeRow.tcrKind === "mechanism" && disputeRow.arbitrator
      ? fetchMechanismBudgetContextByArbitratorId(disputeRow.arbitrator)
      : Promise.resolve(null),
  ]);

  const goalAddress =
    disputeRow.goalTreasury ??
    requestRow?.goalTreasury ??
    goalContext?.goalTreasury ??
    mechanismContext?.goalTreasury ??
    null;
  const budgetAddress =
    disputeRow.budgetTreasury ?? requestRow?.budgetTreasury ?? mechanismContext?.budgetTreasury ?? null;
  const stakeVaultAddress = disputeRow.stakeVault ?? goalContext?.stakeVault ?? mechanismContext?.stakeVault ?? null;

  const [budgetRow, goalRow] = await Promise.all([
    budgetAddress ? fetchBudgetById(budgetAddress) : Promise.resolve(null),
    goalAddress ? fetchGoalById(goalAddress) : Promise.resolve(null),
  ]);

  return {
    goalRow,
    budgetRow,
    requestRow,
    goalAddress,
    budgetAddress,
    stakeVaultAddress,
  };
}
