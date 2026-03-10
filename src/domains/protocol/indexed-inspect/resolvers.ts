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
  fetchBudgetRecipientLookup,
  fetchBudgetStackById,
  fetchDisputeById,
  fetchDisputeByTcrAndDisputeId,
  fetchGoalById,
  fetchGoalByRouteKey,
  fetchGoalContextByArbitratorId,
  fetchGoalContextByBudgetId,
  fetchGoalContextByBudgetTcrId,
  fetchMechanismBudgetContextByArbitratorId,
  fetchMechanismBudgetContextByTcrId,
  fetchPremiumEscrowByBudgetId,
  fetchPremiumEscrowByBudgetStackId,
  fetchPremiumEscrowById,
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

export async function resolveGoal(identifier: string): Promise<GoalTreasuryRow | null> {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0) return null;

  if (isAddress(normalized)) {
    return fetchGoalById(normalizeHexAddress(normalized));
  }

  return fetchGoalByRouteKey(normalizeGoalLookupKey(normalized));
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
    const goalContext = await fetchGoalContextByBudgetId(budgetRow.id);
    const goalRowFromBudget = goalContext?.goalTreasury ? await fetchGoalById(goalContext.goalTreasury) : null;
    const stakeVaultAddress = goalContext?.stakeVault ?? goalRowFromBudget?.stakeVault ?? null;
    const stakeVaultRow = stakeVaultAddress ? await fetchStakeVaultById(stakeVaultAddress) : null;

    return {
      stakeVaultRow,
      goalRow: goalRowFromBudget,
      budgetRow,
      goalAddress: goalRowFromBudget?.id ?? goalContext?.goalTreasury ?? null,
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
  let stackRow = await fetchBudgetStackById(lookupKey);
  const budgetRowFromStack = stackRow?.budgetTreasury ? await fetchBudgetById(stackRow.budgetTreasury) : null;

  let premiumRow = stackRow?.premiumEscrow ? await fetchPremiumEscrowById(stackRow.premiumEscrow) : null;
  if (!premiumRow) premiumRow = await fetchPremiumEscrowById(lookupKey);
  if (!premiumRow) premiumRow = await fetchPremiumEscrowByBudgetId(lookupKey);
  if (!premiumRow) premiumRow = await fetchPremiumEscrowByBudgetStackId(lookupKey);
  if (!premiumRow) return null;

  if (!stackRow && premiumRow.budgetStackId) {
    stackRow = await fetchBudgetStackById(premiumRow.budgetStackId);
  }

  const budgetAddress = budgetRowFromStack?.id ?? premiumRow.budgetTreasury ?? stackRow?.budgetTreasury ?? null;
  const budgetRow = budgetRowFromStack ?? (budgetAddress ? await fetchBudgetById(budgetAddress) : null);
  const goalContext = budgetAddress ? await fetchGoalContextByBudgetId(budgetAddress) : null;
  const goalRow = goalContext?.goalTreasury ? await fetchGoalById(goalContext.goalTreasury) : null;

  return {
    premiumRow,
    stackRow,
    budgetRow,
    goalRow,
    goalAddress: goalRow?.id ?? goalContext?.goalTreasury ?? null,
  };
}

export async function resolveTcrRequestContext(requestRow: TcrRequestRow): Promise<TcrRequestContext> {
  const itemRow =
    requestRow.tcrAddress && requestRow.itemId
      ? await fetchTcrItemById(buildTcrItemId(requestRow.tcrAddress, requestRow.itemId))
      : null;
  const budgetGoalContext =
    !requestRow.goalTreasury && requestRow.tcrKind === "budget" && requestRow.tcrAddress
      ? await fetchGoalContextByBudgetTcrId(requestRow.tcrAddress)
      : null;
  const mechanismContext =
    requestRow.tcrKind === "mechanism" && requestRow.tcrAddress
      ? await fetchMechanismBudgetContextByTcrId(requestRow.tcrAddress)
      : null;

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
  const requestRow =
    disputeRow.tcrAddress && disputeRow.itemId && disputeRow.requestIndex
      ? await fetchTcrRequestById(buildTcrRequestId(disputeRow.tcrAddress, disputeRow.itemId, disputeRow.requestIndex))
      : null;
  const goalContext =
    !disputeRow.goalTreasury && disputeRow.arbitrator ? await fetchGoalContextByArbitratorId(disputeRow.arbitrator) : null;
  const mechanismContext =
    disputeRow.tcrKind === "mechanism" && disputeRow.arbitrator
      ? await fetchMechanismBudgetContextByArbitratorId(disputeRow.arbitrator)
      : null;

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
