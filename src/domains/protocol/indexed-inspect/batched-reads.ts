import { and, eq, inArray, or } from "drizzle-orm";
import { cobuildDb } from "../../../infra/db/cobuildDb";
import {
  arbitratorDispute,
  budgetContextByMechanismArbitrator,
  budgetContextByMechanismTcr,
  budgetStack,
  budgetTreasury,
  budgetTreasuryByRecipient,
  flowRecipient,
  goalContextByArbitrator,
  goalContextByBudgetTcr,
  goalContextByBudgetTreasury,
  goalFactoryDeployment,
  goalTreasury,
  juror,
  jurorDisputeMember,
  jurorVoteReceipt,
  premiumAccount,
  premiumEscrow,
  stakePosition,
  stakeVault,
  tcrItem,
  tcrRequest,
} from "../../../infra/db/schema/protocol";
import { buildPremiumAccountId, compositeIdEndsWithAddress, normalizeAccountLookup } from "./identifiers";
import type {
  ArbitratorDisputeRow,
  BudgetInspectReadBundle,
  BudgetStackRow,
  BudgetTreasuryByRecipientRow,
  BudgetTreasuryRow,
  DisputeJurorReadBundle,
  FlowRecipientRow,
  GoalContextByArbitratorRow,
  GoalContextByBudgetTcrRow,
  GoalContextByBudgetTreasuryRow,
  GoalFactoryDeploymentRow,
  GoalInspectReadBundle,
  GoalTreasuryRow,
  JurorDisputeMemberRow,
  JurorRow,
  JurorVoteReceiptRow,
  PremiumAccountReadBundle,
  PremiumEscrowRow,
  StakeAccountReadBundle,
  StakePositionRow,
  StakeVaultRow,
  TcrItemRow,
  TcrRequestRow,
  BudgetContextByMechanismArbitratorRow,
  BudgetContextByMechanismTcrRow,
} from "./types";

async function takeFirst<T>(rowsPromise: Promise<T[]>): Promise<T | null> {
  const rows = await rowsPromise;
  return rows[0] ?? null;
}

export async function fetchGoalById(id: string): Promise<GoalTreasuryRow | null> {
  return takeFirst(cobuildDb.select().from(goalTreasury).where(eq(goalTreasury.id, id)));
}

export async function fetchGoalByRouteKey(routeKey: string): Promise<GoalTreasuryRow | null> {
  return takeFirst(
    cobuildDb
      .select()
      .from(goalTreasury)
      .where(or(eq(goalTreasury.canonicalRouteSlug, routeKey), eq(goalTreasury.canonicalRouteDomain, routeKey))),
  );
}

export async function fetchBudgetById(id: string): Promise<BudgetTreasuryRow | null> {
  return takeFirst(cobuildDb.select().from(budgetTreasury).where(eq(budgetTreasury.id, id)));
}

export async function fetchBudgetByRecipientId(recipientId: string): Promise<BudgetTreasuryRow | null> {
  return takeFirst(cobuildDb.select().from(budgetTreasury).where(eq(budgetTreasury.recipientId, recipientId)));
}

export async function fetchBudgetRecipientLookup(id: string): Promise<BudgetTreasuryByRecipientRow | null> {
  return takeFirst(cobuildDb.select().from(budgetTreasuryByRecipient).where(eq(budgetTreasuryByRecipient.id, id)));
}

export async function fetchGoalContextByBudgetId(id: string): Promise<GoalContextByBudgetTreasuryRow | null> {
  return takeFirst(cobuildDb.select().from(goalContextByBudgetTreasury).where(eq(goalContextByBudgetTreasury.id, id)));
}

export async function fetchGoalContextsByGoalId(goalId: string): Promise<GoalContextByBudgetTreasuryRow[]> {
  return cobuildDb.select().from(goalContextByBudgetTreasury).where(eq(goalContextByBudgetTreasury.goalTreasury, goalId));
}

export async function fetchGoalContextByBudgetTcrId(id: string): Promise<GoalContextByBudgetTcrRow | null> {
  return takeFirst(cobuildDb.select().from(goalContextByBudgetTcr).where(eq(goalContextByBudgetTcr.id, id)));
}

export async function fetchGoalContextByArbitratorId(id: string): Promise<GoalContextByArbitratorRow | null> {
  return takeFirst(cobuildDb.select().from(goalContextByArbitrator).where(eq(goalContextByArbitrator.id, id)));
}

export async function fetchMechanismBudgetContextByTcrId(id: string): Promise<BudgetContextByMechanismTcrRow | null> {
  return takeFirst(
    cobuildDb.select().from(budgetContextByMechanismTcr).where(eq(budgetContextByMechanismTcr.id, id)),
  );
}

export async function fetchMechanismBudgetContextByArbitratorId(
  id: string,
): Promise<BudgetContextByMechanismArbitratorRow | null> {
  return takeFirst(
    cobuildDb
      .select()
      .from(budgetContextByMechanismArbitrator)
      .where(eq(budgetContextByMechanismArbitrator.id, id)),
  );
}

export async function fetchGoalFactoryDeploymentByGoalId(goalId: string): Promise<GoalFactoryDeploymentRow | null> {
  return takeFirst(
    cobuildDb.select().from(goalFactoryDeployment).where(eq(goalFactoryDeployment.goalTreasury, goalId)),
  );
}

export async function fetchFlowRecipientsByFlowId(flowId: string): Promise<FlowRecipientRow[]> {
  return cobuildDb.select().from(flowRecipient).where(eq(flowRecipient.flowId, flowId));
}

export async function fetchFlowRecipientsByBudgetId(budgetId: string): Promise<FlowRecipientRow[]> {
  return cobuildDb.select().from(flowRecipient).where(eq(flowRecipient.budgetTreasury, budgetId));
}

export async function fetchBudgetsByIds(ids: string[]): Promise<BudgetTreasuryRow[]> {
  return ids.length > 0 ? cobuildDb.select().from(budgetTreasury).where(inArray(budgetTreasury.id, ids)) : [];
}

export async function fetchStakeVaultById(id: string): Promise<StakeVaultRow | null> {
  return takeFirst(cobuildDb.select().from(stakeVault).where(eq(stakeVault.id, id)));
}

export async function fetchBudgetStackById(id: string): Promise<BudgetStackRow | null> {
  return takeFirst(cobuildDb.select().from(budgetStack).where(eq(budgetStack.id, id)));
}

export async function fetchPremiumEscrowById(id: string): Promise<PremiumEscrowRow | null> {
  return takeFirst(cobuildDb.select().from(premiumEscrow).where(eq(premiumEscrow.id, id)));
}

export async function fetchPremiumEscrowByBudgetId(budgetId: string): Promise<PremiumEscrowRow | null> {
  return takeFirst(cobuildDb.select().from(premiumEscrow).where(eq(premiumEscrow.budgetTreasury, budgetId)));
}

export async function fetchPremiumEscrowByBudgetStackId(stackId: string): Promise<PremiumEscrowRow | null> {
  return takeFirst(cobuildDb.select().from(premiumEscrow).where(eq(premiumEscrow.budgetStackId, stackId)));
}

export async function fetchTcrRequestById(id: string): Promise<TcrRequestRow | null> {
  return takeFirst(cobuildDb.select().from(tcrRequest).where(eq(tcrRequest.id, id)));
}

export async function fetchTcrItemById(id: string): Promise<TcrItemRow | null> {
  return takeFirst(cobuildDb.select().from(tcrItem).where(eq(tcrItem.id, id)));
}

export async function fetchDisputeById(id: string): Promise<ArbitratorDisputeRow | null> {
  return takeFirst(cobuildDb.select().from(arbitratorDispute).where(eq(arbitratorDispute.id, id)));
}

export async function fetchDisputeByTcrAndDisputeId(
  tcrAddress: string,
  disputeId: string,
): Promise<ArbitratorDisputeRow | null> {
  return takeFirst(
    cobuildDb
      .select()
      .from(arbitratorDispute)
      .where(and(eq(arbitratorDispute.tcrAddress, tcrAddress), eq(arbitratorDispute.disputeId, disputeId))),
  );
}

export async function fetchJurorDisputeMembers(
  arbitrator: string,
  disputeId: string,
): Promise<JurorDisputeMemberRow[]> {
  return cobuildDb
    .select()
    .from(jurorDisputeMember)
    .where(and(eq(jurorDisputeMember.arbitrator, arbitrator), eq(jurorDisputeMember.disputeId, disputeId)));
}

export async function fetchJurorByVaultAndAddress(vault: string, jurorAddress: string): Promise<JurorRow | null> {
  return takeFirst(
    cobuildDb
      .select()
      .from(juror)
      .where(and(eq(juror.vault, vault), eq(juror.jurorAddress, jurorAddress))),
  );
}

export async function fetchJurorVoteReceipts(
  arbitrator: string,
  disputeId: string,
  jurorAddress: string,
): Promise<JurorVoteReceiptRow[]> {
  return cobuildDb
    .select()
    .from(jurorVoteReceipt)
    .where(
      and(
        eq(jurorVoteReceipt.arbitrator, arbitrator),
        eq(jurorVoteReceipt.disputeId, disputeId),
        eq(jurorVoteReceipt.jurorAddress, jurorAddress),
      ),
    );
}

export async function fetchStakePositionsByVaultAndAccount(
  vault: string,
  account: string,
): Promise<StakePositionRow[]> {
  return cobuildDb
    .select()
    .from(stakePosition)
    .where(and(eq(stakePosition.vault, vault), eq(stakePosition.account, account)));
}

export async function fetchPremiumAccountByEscrowAndAccount(
  escrowId: string,
  account: string,
): Promise<PremiumAccountReadBundle> {
  const normalizedAccount = normalizeAccountLookup(account);
  const accountRow = await takeFirst(
    cobuildDb
      .select()
      .from(premiumAccount)
      .where(eq(premiumAccount.id, buildPremiumAccountId(escrowId, normalizedAccount))),
  );

  return {
    normalizedAccount,
    accountRow,
  };
}

export async function fetchGoalInspectBundle(goalRow: GoalTreasuryRow): Promise<GoalInspectReadBundle> {
  const [deployment, budgetContextRows, recipientRows, stakeVaultRow] = await Promise.all([
    fetchGoalFactoryDeploymentByGoalId(goalRow.id),
    fetchGoalContextsByGoalId(goalRow.id),
    goalRow.flowAddress ? fetchFlowRecipientsByFlowId(goalRow.flowAddress) : Promise.resolve([] as FlowRecipientRow[]),
    goalRow.stakeVault ? fetchStakeVaultById(goalRow.stakeVault) : Promise.resolve(null),
  ]);

  const budgetIds = budgetContextRows
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  return {
    deployment,
    recipientRows,
    stakeVaultRow,
    budgetRows: await fetchBudgetsByIds(budgetIds),
  };
}

export async function fetchBudgetInspectBundle(budgetRow: BudgetTreasuryRow): Promise<BudgetInspectReadBundle> {
  const [goalContext, recipientRows, premiumRow] = await Promise.all([
    fetchGoalContextByBudgetId(budgetRow.id),
    fetchFlowRecipientsByBudgetId(budgetRow.id),
    budgetRow.premiumEscrow ? fetchPremiumEscrowById(budgetRow.premiumEscrow) : Promise.resolve(null),
  ]);

  const goalContextAddress =
    typeof goalContext?.goalTreasury === "string" && goalContext.goalTreasury.length > 0 ? goalContext.goalTreasury : null;
  const [goalRow, deployment] = goalContextAddress
    ? await Promise.all([
        fetchGoalById(goalContextAddress),
        fetchGoalFactoryDeploymentByGoalId(goalContextAddress),
      ])
    : [null, null];

  return {
    goalContext,
    recipientRows,
    premiumRow,
    goalRow,
    deployment,
  };
}

export async function fetchDisputeJurorBundle(
  arbitrator: string | null,
  disputeId: string | null,
  stakeVaultAddress: string | null,
  jurorAddress?: string,
): Promise<DisputeJurorReadBundle> {
  const normalizedJuror = jurorAddress ? normalizeAccountLookup(jurorAddress) : null;
  const memberRows: JurorDisputeMemberRow[] = arbitrator && disputeId ? await fetchJurorDisputeMembers(arbitrator, disputeId) : [];
  const selectedMember = normalizedJuror
    ? memberRows.find(
        (row) =>
          row.jurorAddress?.toLowerCase() === normalizedJuror || compositeIdEndsWithAddress(row.id, normalizedJuror),
      ) ?? null
    : null;
  const [currentJurorRow, receiptRows]: [JurorRow | null, JurorVoteReceiptRow[]] =
    normalizedJuror && arbitrator && disputeId && stakeVaultAddress
      ? await Promise.all([
          fetchJurorByVaultAndAddress(stakeVaultAddress, normalizedJuror),
          fetchJurorVoteReceipts(arbitrator, disputeId, normalizedJuror),
        ])
      : [null, []];

  return {
    normalizedJuror,
    memberRows,
    selectedMember: selectedMember ?? null,
    currentJurorRow,
    receiptRows,
  };
}

export async function fetchStakeAccountBundle(
  stakeVaultAddress: string | null,
  account: string,
): Promise<StakeAccountReadBundle> {
  const normalizedAccount = normalizeAccountLookup(account);
  const [positionRows, jurorRow] =
    stakeVaultAddress
      ? await Promise.all([
          fetchStakePositionsByVaultAndAccount(stakeVaultAddress, normalizedAccount),
          fetchJurorByVaultAndAddress(stakeVaultAddress, normalizedAccount),
        ])
      : [[], null];

  return {
    normalizedAccount,
    positionRows,
    jurorRow,
  };
}
