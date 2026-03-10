import { eq, inArray, or } from "drizzle-orm";
import { getAddress, isAddress } from "viem";
import { cobuildDb } from "../../infra/db/cobuildDb";
import {
  budgetTreasury,
  flowRecipient,
  goalContextByBudgetTreasury,
  goalFactoryDeployment,
  goalTreasury,
  premiumEscrow,
  stakeVault,
} from "../../infra/db/schema/protocol";

const GOAL_STATE_LABELS = ["Funding", "Active", "Succeeded", "Expired"] as const;
const BUDGET_STATE_LABELS = ["Funding", "Active", "Succeeded", "Failed", "Expired"] as const;

type GoalStateLabel = (typeof GOAL_STATE_LABELS)[number];
type BudgetStateLabel = (typeof BUDGET_STATE_LABELS)[number];

function normalizeHexAddress(value: string): string {
  return getAddress(value).toLowerCase();
}

function normalizeLookupIdentifier(value: string): string {
  return value.trim();
}

function normalizeGoalLookupKey(value: string): string {
  return normalizeLookupIdentifier(value).toLowerCase();
}

function toIsoTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function toStateCode(code: number | null | undefined): number | null {
  return typeof code === "number" ? code : null;
}

function goalStateLabel(code: number | null | undefined): GoalStateLabel | null {
  const safeCode = toStateCode(code);
  return safeCode !== null && safeCode >= 0 && safeCode < GOAL_STATE_LABELS.length
    ? GOAL_STATE_LABELS[safeCode]
    : null;
}

function budgetStateLabel(code: number | null | undefined): BudgetStateLabel | null {
  const safeCode = toStateCode(code);
  return safeCode !== null && safeCode >= 0 && safeCode < BUDGET_STATE_LABELS.length
    ? BUDGET_STATE_LABELS[safeCode]
    : null;
}

function compactProject(chainId: number | null | undefined, projectId: number | null | undefined) {
  if (chainId == null && projectId == null) return null;
  return {
    chainId: chainId ?? null,
    projectId: projectId ?? null,
  };
}

function compactRoute(slug: string | null | undefined, domain: string | null | undefined) {
  if (!slug && !domain) return null;
  return {
    slug: slug ?? null,
    domain: domain ?? null,
  };
}

async function resolveGoal(identifier: string) {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0) return null;

  if (isAddress(normalized)) {
    const rows = await cobuildDb
      .select()
      .from(goalTreasury)
      .where(eq(goalTreasury.id, normalizeHexAddress(normalized)));
    return rows[0] ?? null;
  }

  const routeKey = normalizeGoalLookupKey(normalized);
  const rows = await cobuildDb
    .select()
    .from(goalTreasury)
    .where(
      or(
        eq(goalTreasury.canonicalRouteSlug, routeKey),
        eq(goalTreasury.canonicalRouteDomain, routeKey),
      ),
    );
  return rows[0] ?? null;
}

async function resolveBudget(identifier: string) {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0) return null;

  if (isAddress(normalized)) {
    const rows = await cobuildDb
      .select()
      .from(budgetTreasury)
      .where(eq(budgetTreasury.id, normalizeHexAddress(normalized)));
    return rows[0] ?? null;
  }

  if (normalized.startsWith("0x")) {
    const rows = await cobuildDb
      .select()
      .from(budgetTreasury)
      .where(eq(budgetTreasury.recipientId, normalized.toLowerCase()));
    return rows[0] ?? null;
  }

  return null;
}

export async function inspectGoal(identifier: string) {
  const goalRow = await resolveGoal(identifier);
  if (!goalRow) return null;

  const [deploymentRows, budgetContextRows, recipientRows, stakeVaultRows] = await Promise.all([
    cobuildDb.select().from(goalFactoryDeployment).where(eq(goalFactoryDeployment.goalTreasury, goalRow.id)),
    cobuildDb
      .select()
      .from(goalContextByBudgetTreasury)
      .where(eq(goalContextByBudgetTreasury.goalTreasury, goalRow.id)),
    goalRow.flowAddress
      ? cobuildDb.select().from(flowRecipient).where(eq(flowRecipient.flowId, goalRow.flowAddress))
      : Promise.resolve([]),
    goalRow.stakeVault
      ? cobuildDb.select().from(stakeVault).where(eq(stakeVault.id, goalRow.stakeVault))
      : Promise.resolve([]),
  ]);

  const deployment = deploymentRows[0] ?? null;
  const budgetIds = budgetContextRows
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const budgetRows =
    budgetIds.length > 0
      ? await cobuildDb.select().from(budgetTreasury).where(inArray(budgetTreasury.id, budgetIds))
      : [];

  const recipientByBudgetId = new Map(
    recipientRows
      .filter((row) => typeof row.budgetTreasury === "string" && row.budgetTreasury.length > 0)
      .map((row) => [row.budgetTreasury as string, row]),
  );

  const budgetSummaries = budgetRows
    .map((row) => {
      const recipient = recipientByBudgetId.get(row.id);
      const stateCode = toStateCode(row.state);
      const state = budgetStateLabel(row.state);
      return {
        budgetAddress: row.id,
        recipientId: row.recipientId,
        state,
        stateCode,
        finalized: Boolean(row.finalized),
        childFlow: row.childFlow,
        premiumEscrow: row.premiumEscrow,
        recipient: {
          address: recipient?.recipient ?? null,
          recipientIndex: recipient?.recipientIndex ?? null,
          title: recipient?.title ?? null,
          tagline: recipient?.tagline ?? null,
          isRemoved: Boolean(recipient?.isRemoved),
        },
      };
    })
    .sort((left, right) => {
      const leftIndex = left.recipient.recipientIndex ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = right.recipient.recipientIndex ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });

  const budgetSummary = {
    total: budgetSummaries.length,
    finalized: budgetSummaries.filter((budget) => budget.finalized).length,
    byState: Object.fromEntries(
      BUDGET_STATE_LABELS.map((label) => [
        label,
        budgetSummaries.filter((budget) => budget.state === label).length,
      ]),
    ),
    items: budgetSummaries,
  };

  const stake = stakeVaultRows[0]
    ? {
        address: stakeVaultRows[0].id,
        resolved: stakeVaultRows[0].resolved,
        goalTotalStaked: stakeVaultRows[0].goalTotalStaked,
        goalTotalWithdrawn: stakeVaultRows[0].goalTotalWithdrawn,
        cobuildTotalStaked: stakeVaultRows[0].cobuildTotalStaked,
        cobuildTotalWithdrawn: stakeVaultRows[0].cobuildTotalWithdrawn,
      }
    : null;
  const stateCode = toStateCode(goalRow.state);
  const state = goalStateLabel(goalRow.state);
  const project = compactProject(goalRow.canonicalProjectChainId, goalRow.canonicalProjectId);
  const route = compactRoute(goalRow.canonicalRouteSlug, goalRow.canonicalRouteDomain);
  const flow =
    goalRow.flowAddress || goalRow.parentFlow || recipientRows.length > 0
      ? {
          address: goalRow.flowAddress ?? null,
          parentFlow: goalRow.parentFlow ?? null,
          recipientCount: recipientRows.length,
          activeRecipientCount: recipientRows.filter((row) => !row.isRemoved).length,
          budgetRecipientCount: recipientRows.filter((row) => Boolean(row.budgetTreasury)).length,
        }
      : null;

  return {
    identifier: normalizeLookupIdentifier(identifier),
    goalAddress: goalRow.id,
    goalRevnetId: goalRow.goalRevnetId ?? null,
    state,
    stateCode,
    finalized: Boolean(goalRow.finalized),
    project,
    route,
    flow,
    stakeVault: stake,
    budgetTcr: deployment?.budgetTcr ?? null,
    treasury: {
      owner: goalRow.owner ?? null,
      minRaise: goalRow.minRaise ?? null,
      minRaiseDeadline: toIsoTimestamp(goalRow.minRaiseDeadline),
      deadline: toIsoTimestamp(goalRow.deadline),
      successAt: toIsoTimestamp(goalRow.successAt),
      lastSyncedTargetRate: goalRow.lastSyncedTargetRate ?? null,
      lastSyncedAppliedRate: goalRow.lastSyncedAppliedRate ?? null,
      lastSyncedTreasuryBalance: goalRow.lastSyncedTreasuryBalance ?? null,
      lastSyncedTimeRemaining: goalRow.lastSyncedTimeRemaining ?? null,
      lastResidualFinalState: goalRow.lastResidualFinalState ?? null,
      lastResidualSettledAmount: goalRow.lastResidualSettledAmount ?? null,
      lastResidualControllerBurnAmount: goalRow.lastResidualControllerBurnAmount ?? null,
      createdAt: toIsoTimestamp(goalRow.createdAtTimestamp),
      updatedAt: toIsoTimestamp(goalRow.updatedAtTimestamp),
    },
    governance: {
      arbitrator: deployment?.arbitrator ?? null,
      deploymentTxHash: deployment?.txHash ?? null,
    },
    timing: {
      minRaiseDeadline: toIsoTimestamp(goalRow.minRaiseDeadline),
      deadline: toIsoTimestamp(goalRow.deadline),
      reassertGraceDeadline: toIsoTimestamp(goalRow.reassertGraceDeadline),
      successAt: toIsoTimestamp(goalRow.successAt),
      successAssertionRegisteredAt: toIsoTimestamp(goalRow.successAssertionRegisteredAt),
      createdAt: toIsoTimestamp(goalRow.createdAtTimestamp),
      updatedAt: toIsoTimestamp(goalRow.updatedAtTimestamp),
    },
    budgets: budgetSummary,
  };
}

export async function inspectBudget(identifier: string) {
  const budgetRow = await resolveBudget(identifier);
  if (!budgetRow) return null;

  const [goalContextRows, recipientRows, premiumRows] = await Promise.all([
    cobuildDb
      .select()
      .from(goalContextByBudgetTreasury)
      .where(eq(goalContextByBudgetTreasury.id, budgetRow.id)),
    cobuildDb.select().from(flowRecipient).where(eq(flowRecipient.budgetTreasury, budgetRow.id)),
    budgetRow.premiumEscrow
      ? cobuildDb.select().from(premiumEscrow).where(eq(premiumEscrow.id, budgetRow.premiumEscrow))
      : Promise.resolve([]),
  ]);

  const goalContext = goalContextRows[0] ?? null;
  const goalContextAddress =
    typeof goalContext?.goalTreasury === "string" && goalContext.goalTreasury.length > 0
      ? goalContext.goalTreasury
      : null;
  const [goalRows, deploymentRows] = goalContextAddress
    ? await Promise.all([
        cobuildDb.select().from(goalTreasury).where(eq(goalTreasury.id, goalContextAddress)),
        cobuildDb
          .select()
          .from(goalFactoryDeployment)
          .where(eq(goalFactoryDeployment.goalTreasury, goalContextAddress)),
      ])
    : [[], []];

  const goalRow = goalRows[0] ?? null;
  const deployment = deploymentRows[0] ?? null;
  const recipient =
    recipientRows.sort((left, right) => {
      const leftIndex = left.recipientIndex ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = right.recipientIndex ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    })[0] ?? null;
  const premium = premiumRows[0] ?? null;
  const stateCode = toStateCode(budgetRow.state);
  const state = budgetStateLabel(budgetRow.state);
  const route = compactRoute(goalRow?.canonicalRouteSlug, goalRow?.canonicalRouteDomain);

  return {
    identifier: normalizeLookupIdentifier(identifier),
    budgetAddress: budgetRow.id,
    recipientId: budgetRow.recipientId ?? null,
    goalAddress: goalContextAddress ?? goalRow?.id ?? null,
    budgetTcr: deployment?.budgetTcr ?? null,
    state,
    stateCode,
    finalized: Boolean(budgetRow.finalized),
    treasury: {
      controller: budgetRow.controller ?? null,
      activationThreshold: budgetRow.activationThreshold ?? null,
      runwayCap: budgetRow.runwayCap ?? null,
      fundingDeadline: toIsoTimestamp(budgetRow.fundingDeadline),
      executionDurationSeconds: budgetRow.executionDuration ?? null,
      successResolutionDisabled: Boolean(budgetRow.successResolutionDisabled),
      lastSyncedTargetRate: budgetRow.lastSyncedTargetRate ?? null,
      lastSyncedAppliedRate: budgetRow.lastSyncedAppliedRate ?? null,
      lastSyncedTreasuryBalance: budgetRow.lastSyncedTreasuryBalance ?? null,
      lastSyncedTimeRemaining: budgetRow.lastSyncedTimeRemaining ?? null,
      lastResidualDestination: budgetRow.lastResidualDestination ?? null,
      lastResidualSettledAmount: budgetRow.lastResidualSettledAmount ?? null,
      createdAt: toIsoTimestamp(budgetRow.createdAtTimestamp),
      updatedAt: toIsoTimestamp(budgetRow.updatedAtTimestamp),
    },
    flow:
      budgetRow.childFlow || recipient
        ? {
            childFlow: budgetRow.childFlow ?? null,
            recipientAddress: recipient?.recipient ?? null,
            recipientIndex: recipient?.recipientIndex ?? null,
            title: recipient?.title ?? null,
            tagline: recipient?.tagline ?? null,
            isRemoved: Boolean(recipient?.isRemoved),
          }
        : null,
    governance: {
      arbitrator: deployment?.arbitrator ?? null,
      goal:
        goalRow || route
          ? {
              goalRevnetId: goalRow?.goalRevnetId ?? null,
              route,
            }
          : null,
      premiumEscrow: budgetRow.premiumEscrow
        ? {
            address: budgetRow.premiumEscrow,
            baselineReceived: premium?.baselineReceived ?? null,
            latestDistributedPremium: premium?.latestDistributedPremium ?? null,
            latestTotalCoverage: premium?.latestTotalCoverage ?? null,
            latestPremiumIndex: premium?.latestPremiumIndex ?? null,
            closed: premium?.closed ?? null,
            finalState: premium?.finalState ?? null,
            activatedAt: toIsoTimestamp(premium?.activatedAt),
            closedAt: toIsoTimestamp(premium?.closedAt),
          }
        : null,
    },
    timing: {
      fundingDeadline: toIsoTimestamp(budgetRow.fundingDeadline),
      reassertGraceDeadline: toIsoTimestamp(budgetRow.reassertGraceDeadline),
      successAssertionRegisteredAt: toIsoTimestamp(budgetRow.successAssertionRegisteredAt),
      createdAt: toIsoTimestamp(budgetRow.createdAtTimestamp),
      updatedAt: toIsoTimestamp(budgetRow.updatedAtTimestamp),
    },
  };
}
