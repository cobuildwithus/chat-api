import {
  fetchBudgetInspectBundle,
  fetchDisputeJurorBundle,
  fetchGoalInspectBundle,
  fetchPremiumAccountByEscrowAndAccount,
  fetchStakeAccountBundle,
} from "./indexed-inspect/batched-reads";
import {
  mapBudgetInspectResponse,
  mapDisputeInspectResponse,
  mapGoalInspectResponse,
  mapPremiumEscrowInspectResponse,
  mapStakePositionInspectResponse,
  mapTcrRequestInspectResponse,
} from "./indexed-inspect/mappers";
import {
  resolveBudget,
  resolveDisputeContext,
  resolveDisputeRow,
  resolveGoal,
  resolvePremiumEscrowContext,
  resolveStakeContext,
  resolveTcrRequestContext,
  resolveTcrRequestRow,
} from "./indexed-inspect/resolvers";

export async function inspectGoal(identifier: string) {
  const goalRow = await resolveGoal(identifier);
  if (!goalRow) return null;

  return mapGoalInspectResponse(identifier, goalRow, await fetchGoalInspectBundle(goalRow));
}

export async function inspectBudget(identifier: string) {
  const budgetRow = await resolveBudget(identifier);
  if (!budgetRow) return null;

  return mapBudgetInspectResponse(identifier, budgetRow, await fetchBudgetInspectBundle(budgetRow));
}

export async function inspectTcrRequest(identifier: string) {
  const requestRow = await resolveTcrRequestRow(identifier);
  if (!requestRow) return null;

  return mapTcrRequestInspectResponse(identifier, requestRow, await resolveTcrRequestContext(requestRow));
}

export async function inspectDispute(identifier: string, jurorAddress?: string) {
  const disputeRow = await resolveDisputeRow(identifier);
  if (!disputeRow) return null;

  const context = await resolveDisputeContext(disputeRow);
  const jurorBundle = await fetchDisputeJurorBundle(
    disputeRow.arbitrator ?? null,
    disputeRow.disputeId ?? null,
    context.stakeVaultAddress,
    jurorAddress,
  );

  return mapDisputeInspectResponse(identifier, disputeRow, context, jurorBundle);
}

export async function inspectStakePosition(identifier: string, account: string) {
  const context = await resolveStakeContext(identifier);
  if (!context) return null;

  return mapStakePositionInspectResponse(identifier, context, await fetchStakeAccountBundle(context.stakeVaultAddress, account));
}

export async function inspectPremiumEscrow(identifier: string, account?: string) {
  const context = await resolvePremiumEscrowContext(identifier);
  if (!context) return null;

  return mapPremiumEscrowInspectResponse(
    identifier,
    context,
    account ? await fetchPremiumAccountByEscrowAndAccount(context.premiumRow.id, account) : { normalizedAccount: null, accountRow: null },
  );
}
