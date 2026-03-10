import { and, eq, inArray, or } from "drizzle-orm";
import { getAddress, isAddress } from "viem";
import { cobuildDb } from "../../infra/db/cobuildDb";
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

function normalizeIndexedIdentifier(value: string): string {
  return normalizeLookupIdentifier(value).toLowerCase();
}

function normalizeOptionalHexLike(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.toLowerCase();
}

function normalizeAccountLookup(value: string): string {
  const normalized = normalizeLookupIdentifier(value);
  return isAddress(normalized, { strict: false }) ? normalizeHexAddress(normalized) : normalized.toLowerCase();
}

function compositeIdEndsWithAddress(id: string | null | undefined, address: string | null | undefined): boolean {
  if (!id || !address) return false;
  return id.toLowerCase().endsWith(`:${address.toLowerCase()}`);
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

function compactGoalSummary(
  goalRow:
    | {
        id: string;
        goalRevnetId: string | null;
        state?: number | null;
        finalized?: boolean | null;
        canonicalRouteSlug: string | null;
        canonicalRouteDomain: string | null;
        stakeVault?: string | null;
      }
    | null
    | undefined,
  goalAddress: string | null = goalRow?.id ?? null,
) {
  if (!goalRow && !goalAddress) return null;
  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    goalAddress: goalAddress ?? null,
    goalRevnetId: goalRow?.goalRevnetId ?? null,
    state: goalStateLabel(goalRow?.state),
    stateCode: toStateCode(goalRow?.state),
    finalized: Boolean(goalRow?.finalized),
    route: compactRoute(goalRow?.canonicalRouteSlug, goalRow?.canonicalRouteDomain),
    stakeVault: goalRow?.stakeVault ?? null,
  };
  /* v8 ignore stop */
}

function compactBudgetSummary(
  budgetRow:
    | {
        id: string;
        recipientId: string | null;
        state: number | null;
        finalized: boolean | null;
        childFlow?: string | null;
        premiumEscrow?: string | null;
      }
    | null
    | undefined,
  budgetAddress: string | null = budgetRow?.id ?? null,
) {
  if (!budgetRow && !budgetAddress) return null;
  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    budgetAddress: budgetAddress ?? null,
    recipientId: budgetRow?.recipientId ?? null,
    state: budgetStateLabel(budgetRow?.state),
    stateCode: toStateCode(budgetRow?.state),
    finalized: Boolean(budgetRow?.finalized),
    childFlow: budgetRow?.childFlow ?? null,
    premiumEscrow: budgetRow?.premiumEscrow ?? null,
  };
  /* v8 ignore stop */
}

function compactStakeVaultSummary(
  stakeVaultRow:
    | {
        id: string;
        kind: string | null;
        treasury: string | null;
        resolved: boolean | null;
        goalTotalStaked: string | null;
        goalTotalWithdrawn: string | null;
        cobuildTotalStaked: string | null;
        cobuildTotalWithdrawn: string | null;
        updatedAtTimestamp?: string | null;
      }
    | null
    | undefined,
  stakeVaultAddress: string | null = stakeVaultRow?.id ?? null,
) {
  if (!stakeVaultRow && !stakeVaultAddress) return null;
  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    address: stakeVaultAddress ?? null,
    kind: stakeVaultRow?.kind ?? null,
    treasury: stakeVaultRow?.treasury ?? null,
    resolved: stakeVaultRow?.resolved ?? null,
    goalTotalStaked: stakeVaultRow?.goalTotalStaked ?? "0",
    goalTotalWithdrawn: stakeVaultRow?.goalTotalWithdrawn ?? "0",
    cobuildTotalStaked: stakeVaultRow?.cobuildTotalStaked ?? "0",
    cobuildTotalWithdrawn: stakeVaultRow?.cobuildTotalWithdrawn ?? "0",
    updatedAt: toIsoTimestamp(stakeVaultRow?.updatedAtTimestamp),
  };
  /* v8 ignore stop */
}

function subtractAmounts(left: string | null | undefined, right: string | null | undefined): string | null {
  if (!left && !right) return null;
  try {
    return (BigInt(left ?? "0") - BigInt(right ?? "0")).toString();
  } catch {
    return null;
  }
}

function buildTcrItemId(tcrAddress: string, itemId: string): string {
  return `${normalizeOptionalHexLike(tcrAddress)}:${normalizeOptionalHexLike(itemId)}`;
}

function buildTcrRequestId(tcrAddress: string, itemId: string, requestIndex: string): string {
  return `${normalizeOptionalHexLike(tcrAddress)}:${normalizeOptionalHexLike(itemId)}:${requestIndex}`;
}

function buildPremiumAccountId(escrowAddress: string, account: string): string {
  return `${normalizeOptionalHexLike(escrowAddress)}:${normalizeAccountLookup(account)}`;
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

async function resolveTcrRequestRow(identifier: string) {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0) return null;

  const rows = await cobuildDb
    .select()
    .from(tcrRequest)
    .where(eq(tcrRequest.id, normalizeIndexedIdentifier(normalized)));
  return rows[0] ?? null;
}

async function resolveDisputeRow(identifier: string) {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0) return null;

  const rows = await cobuildDb
    .select()
    .from(arbitratorDispute)
    .where(eq(arbitratorDispute.id, normalizeIndexedIdentifier(normalized)));
  return rows[0] ?? null;
}

async function resolveStakeContext(identifier: string) {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0) return null;

  const goalRow = await resolveGoal(identifier);
  if (goalRow) {
    const stakeVaultRow =
      goalRow.stakeVault
        ? (
            await cobuildDb
              .select()
              .from(stakeVault)
              .where(eq(stakeVault.id, goalRow.stakeVault))
          )[0] ?? null
        : null;

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
    const recipientRow =
      (
        await cobuildDb
          .select()
          .from(budgetTreasuryByRecipient)
          .where(eq(budgetTreasuryByRecipient.id, normalized.toLowerCase()))
      )[0] ?? null;
    if (recipientRow?.budgetTreasury) {
      budgetRow =
        (
          await cobuildDb
            .select()
            .from(budgetTreasury)
            .where(eq(budgetTreasury.id, recipientRow.budgetTreasury))
        )[0] ?? null;
    }
  }

  if (budgetRow) {
    const goalContext =
      (
        await cobuildDb
          .select()
          .from(goalContextByBudgetTreasury)
          .where(eq(goalContextByBudgetTreasury.id, budgetRow.id))
      )[0] ?? null;
    const goalRowFromBudget =
      goalContext?.goalTreasury
        ? (
            await cobuildDb
              .select()
              .from(goalTreasury)
              .where(eq(goalTreasury.id, goalContext.goalTreasury))
          )[0] ?? null
        : null;
    const stakeVaultAddress = goalContext?.stakeVault ?? goalRowFromBudget?.stakeVault ?? null;
    const stakeVaultRow =
      stakeVaultAddress
        ? (
            await cobuildDb
              .select()
              .from(stakeVault)
              .where(eq(stakeVault.id, stakeVaultAddress))
          )[0] ?? null
        : null;

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

  const lookupKey = normalized.toLowerCase();
  const stakeVaultRow =
    (
      await cobuildDb
        .select()
        .from(stakeVault)
        .where(eq(stakeVault.id, lookupKey))
    )[0] ?? null;
  if (!stakeVaultRow) return null;

  let goalRowFromVault: Awaited<ReturnType<typeof resolveGoal>> = null;
  let budgetRowFromVault: Awaited<ReturnType<typeof resolveBudget>> = null;
  if (stakeVaultRow.treasury) {
    if (stakeVaultRow.kind === "goal") {
      goalRowFromVault =
        (
          await cobuildDb
            .select()
            .from(goalTreasury)
            .where(eq(goalTreasury.id, stakeVaultRow.treasury))
        )[0] ?? null;
    } else if (stakeVaultRow.kind === "budget") {
      budgetRowFromVault =
        (
          await cobuildDb
            .select()
            .from(budgetTreasury)
            .where(eq(budgetTreasury.id, stakeVaultRow.treasury))
        )[0] ?? null;
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

async function resolvePremiumEscrowContext(identifier: string) {
  const normalized = normalizeLookupIdentifier(identifier);
  if (normalized.length === 0 || !normalized.startsWith("0x")) return null;

  const lookupKey = normalized.toLowerCase();
  let stackRow =
    (
      await cobuildDb
        .select()
        .from(budgetStack)
        .where(eq(budgetStack.id, lookupKey))
    )[0] ?? null;

  const budgetAddressFromStack = stackRow?.budgetTreasury ?? null;
  const budgetRowFromStack =
    budgetAddressFromStack
      ? (
          await cobuildDb
            .select()
            .from(budgetTreasury)
            .where(eq(budgetTreasury.id, budgetAddressFromStack))
        )[0] ?? null
      : null;

  let premiumRow =
    stackRow?.premiumEscrow
      ? (
          await cobuildDb
            .select()
            .from(premiumEscrow)
            .where(eq(premiumEscrow.id, stackRow.premiumEscrow))
        )[0] ?? null
      : null;

  if (!premiumRow) {
    premiumRow =
      (
        await cobuildDb
          .select()
          .from(premiumEscrow)
          .where(eq(premiumEscrow.id, lookupKey))
      )[0] ?? null;
  }
  if (!premiumRow) {
    premiumRow =
      (
        await cobuildDb
          .select()
          .from(premiumEscrow)
          .where(eq(premiumEscrow.budgetTreasury, lookupKey))
      )[0] ?? null;
  }
  if (!premiumRow) {
    premiumRow =
      (
        await cobuildDb
          .select()
          .from(premiumEscrow)
          .where(eq(premiumEscrow.budgetStackId, lookupKey))
      )[0] ?? null;
  }
  if (!premiumRow) return null;

  if (!stackRow && premiumRow.budgetStackId) {
    stackRow =
      (
        await cobuildDb
          .select()
          .from(budgetStack)
          .where(eq(budgetStack.id, premiumRow.budgetStackId))
      )[0] ?? null;
  }

  const budgetAddress = budgetRowFromStack?.id ?? premiumRow.budgetTreasury ?? stackRow?.budgetTreasury ?? null;
  const budgetRow =
    budgetRowFromStack ??
    (budgetAddress
      ? (
          await cobuildDb
            .select()
            .from(budgetTreasury)
            .where(eq(budgetTreasury.id, budgetAddress))
        )[0] ?? null
      : null);

  const goalContext =
    budgetAddress
      ? (
          await cobuildDb
            .select()
            .from(goalContextByBudgetTreasury)
            .where(eq(goalContextByBudgetTreasury.id, budgetAddress))
        )[0] ?? null
      : null;
  const goalRow =
    goalContext?.goalTreasury
      ? (
          await cobuildDb
            .select()
            .from(goalTreasury)
            .where(eq(goalTreasury.id, goalContext.goalTreasury))
        )[0] ?? null
      : null;
  return {
    premiumRow,
    stackRow,
    budgetRow,
    goalRow,
    goalAddress: goalRow?.id ?? goalContext?.goalTreasury ?? null,
  };
}

async function resolveTcrRequestContext(requestRow: NonNullable<Awaited<ReturnType<typeof resolveTcrRequestRow>>>) {
  const itemRow =
    requestRow.tcrAddress && requestRow.itemId
      ? (
          await cobuildDb
            .select()
            .from(tcrItem)
            .where(eq(tcrItem.id, buildTcrItemId(requestRow.tcrAddress, requestRow.itemId)))
        )[0] ?? null
      : null;

  const budgetGoalContext =
    !requestRow.goalTreasury && requestRow.tcrKind === "budget" && requestRow.tcrAddress
      ? (
          await cobuildDb
            .select()
            .from(goalContextByBudgetTcr)
            .where(eq(goalContextByBudgetTcr.id, requestRow.tcrAddress))
        )[0] ?? null
      : null;

  const mechanismContext =
    requestRow.tcrKind === "mechanism" && requestRow.tcrAddress
      ? (
          await cobuildDb
            .select()
            .from(budgetContextByMechanismTcr)
            .where(eq(budgetContextByMechanismTcr.id, requestRow.tcrAddress))
        )[0] ?? null
      : null;

  const goalAddress =
    requestRow.goalTreasury ??
    itemRow?.goalTreasury ??
    budgetGoalContext?.goalTreasury ??
    mechanismContext?.goalTreasury ??
    null;
  const budgetAddress =
    requestRow.budgetTreasury ??
    itemRow?.budgetTreasury ??
    mechanismContext?.budgetTreasury ??
    null;
  const budgetTcrAddress =
    requestRow.tcrKind === "budget" ? requestRow.tcrAddress ?? null : mechanismContext?.budgetTcr ?? null;

  const budgetRow =
    budgetAddress
      ? (
          await cobuildDb
            .select()
            .from(budgetTreasury)
            .where(eq(budgetTreasury.id, budgetAddress))
        )[0] ?? null
      : null;
  const goalRow =
    goalAddress
      ? (
          await cobuildDb
            .select()
            .from(goalTreasury)
            .where(eq(goalTreasury.id, goalAddress))
        )[0] ?? null
      : null;
  const disputeRow =
    requestRow.disputeId && requestRow.tcrAddress
      ? (
          await cobuildDb
            .select()
            .from(arbitratorDispute)
            .where(
              and(
                eq(arbitratorDispute.tcrAddress, requestRow.tcrAddress),
                eq(arbitratorDispute.disputeId, requestRow.disputeId),
              ),
            )
        )[0] ?? null
      : null;

  return {
    itemRow,
    mechanismContext,
    goalRow,
    budgetRow,
    disputeRow,
    goalAddress,
    budgetAddress,
    budgetTcrAddress,
  };
}

async function resolveDisputeContext(disputeRow: NonNullable<Awaited<ReturnType<typeof resolveDisputeRow>>>) {
  const requestRow =
    disputeRow.tcrAddress && disputeRow.itemId && disputeRow.requestIndex
      ? (
          await cobuildDb
            .select()
            .from(tcrRequest)
            .where(
              eq(
                tcrRequest.id,
                buildTcrRequestId(disputeRow.tcrAddress, disputeRow.itemId, disputeRow.requestIndex),
              ),
            )
        )[0] ?? null
      : null;

  const goalContext =
    !disputeRow.goalTreasury && disputeRow.arbitrator
      ? (
          await cobuildDb
            .select()
            .from(goalContextByArbitrator)
            .where(eq(goalContextByArbitrator.id, disputeRow.arbitrator))
        )[0] ?? null
      : null;

  const mechanismContext =
    disputeRow.tcrKind === "mechanism" && disputeRow.arbitrator
      ? (
          await cobuildDb
            .select()
            .from(budgetContextByMechanismArbitrator)
            .where(eq(budgetContextByMechanismArbitrator.id, disputeRow.arbitrator))
        )[0] ?? null
      : null;

  const goalAddress =
    disputeRow.goalTreasury ??
    requestRow?.goalTreasury ??
    goalContext?.goalTreasury ??
    mechanismContext?.goalTreasury ??
    null;
  const budgetAddress =
    disputeRow.budgetTreasury ?? requestRow?.budgetTreasury ?? mechanismContext?.budgetTreasury ?? null;
  const stakeVaultAddress =
    disputeRow.stakeVault ?? goalContext?.stakeVault ?? mechanismContext?.stakeVault ?? null;

  const budgetRow =
    budgetAddress
      ? (
          await cobuildDb
            .select()
            .from(budgetTreasury)
            .where(eq(budgetTreasury.id, budgetAddress))
        )[0] ?? null
      : null;
  const goalRow =
    goalAddress
      ? (
          await cobuildDb
            .select()
            .from(goalTreasury)
            .where(eq(goalTreasury.id, goalAddress))
        )[0] ?? null
      : null;

  return {
    goalRow,
    budgetRow,
    requestRow,
    goalAddress,
    budgetAddress,
    stakeVaultAddress,
    budgetTcrAddress: goalContext?.budgetTcr ?? mechanismContext?.budgetTcr ?? null,
  };
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

  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
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
  /* v8 ignore stop */
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

  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
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
  /* v8 ignore stop */
}

export async function inspectTcrRequest(identifier: string) {
  const requestRow = await resolveTcrRequestRow(identifier);
  if (!requestRow) return null;

  const context = await resolveTcrRequestContext(requestRow);

  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    identifier: normalizeLookupIdentifier(identifier),
    requestId: requestRow.id ?? normalizeIndexedIdentifier(identifier),
    requestIndex: requestRow.requestIndex ?? null,
    requestType: requestRow.requestType ?? null,
    tcr: {
      address: requestRow.tcrAddress ?? null,
      kind: requestRow.tcrKind ?? null,
    },
    goal: compactGoalSummary(context.goalRow, context.goalAddress),
    budget: compactBudgetSummary(context.budgetRow, context.budgetAddress),
    actors: {
      requester: requestRow.requester ?? null,
      challenger: requestRow.challenger ?? null,
    },
    item: {
      itemId: requestRow.itemId ?? null,
      currentStatus: context.itemRow?.currentStatus ?? null,
      evidenceGroupId: context.itemRow?.evidenceGroupId ?? null,
      submitter: context.itemRow?.submitter ?? null,
      latestRequestIndex: context.itemRow?.latestRequestIndex ?? null,
      latestRequest:
        Boolean(context.itemRow?.latestRequestIndex) &&
        context.itemRow?.latestRequestIndex === requestRow.requestIndex,
    },
    dispute: context.disputeRow
      ? {
          identifier: context.disputeRow.id,
          arbitrator: context.disputeRow.arbitrator ?? null,
          disputeId: context.disputeRow.disputeId ?? null,
          currentRound: context.disputeRow.currentRound ?? null,
          ruling: context.disputeRow.ruling ?? null,
          executedAt: toIsoTimestamp(context.disputeRow.executedAt),
        }
      : null,
    timing: {
      submittedAt: toIsoTimestamp(requestRow.submittedAt),
      challengedAt: toIsoTimestamp(requestRow.challengedAt),
      updatedAt: toIsoTimestamp(requestRow.updatedAtTimestamp),
    },
    txHash: requestRow.txHash ?? null,
  };
  /* v8 ignore stop */
}

export async function inspectDispute(identifier: string, jurorAddress?: string) {
  const disputeRow = await resolveDisputeRow(identifier);
  if (!disputeRow) return null;

  const context = await resolveDisputeContext(disputeRow);
  const normalizedJuror = jurorAddress ? normalizeAccountLookup(jurorAddress) : null;
  const disputeArbitrator = disputeRow.arbitrator ?? null;
  const disputeId = disputeRow.disputeId ?? null;
  const memberRows =
    disputeArbitrator && disputeId
      ? await cobuildDb
          .select()
          .from(jurorDisputeMember)
          .where(
            and(
              eq(jurorDisputeMember.arbitrator, disputeArbitrator),
              eq(jurorDisputeMember.disputeId, disputeId),
            ),
          )
      : [];
  const selectedMember = normalizedJuror
    ? memberRows.find(
        (row) =>
          normalizeOptionalHexLike(row.jurorAddress) === normalizedJuror ||
          compositeIdEndsWithAddress(row.id, normalizedJuror),
      ) ?? null
    : null;
  const currentJurorRow =
    normalizedJuror && context.stakeVaultAddress
      ? (
          await cobuildDb
            .select()
            .from(juror)
            .where(
              and(
                eq(juror.vault, context.stakeVaultAddress),
                eq(juror.jurorAddress, normalizedJuror),
              ),
            )
        )[0] ?? null
      : null;
  const receiptRows =
    normalizedJuror && disputeArbitrator && disputeId
      ? await cobuildDb
          .select()
          .from(jurorVoteReceipt)
          .where(
            and(
              eq(jurorVoteReceipt.arbitrator, disputeArbitrator),
              eq(jurorVoteReceipt.disputeId, disputeId),
              eq(jurorVoteReceipt.jurorAddress, normalizedJuror),
            ),
          )
      : [];

  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    identifier: normalizeLookupIdentifier(identifier),
    disputeId: disputeRow.disputeId ?? null,
    arbitrator: disputeRow.arbitrator ?? null,
    currentRound: disputeRow.currentRound ?? null,
    jurorCount: memberRows.length || disputeRow.jurorAddresses?.length || 0,
    ruling: disputeRow.ruling ?? null,
    choices: disputeRow.choices ?? null,
    arbitrationCost: disputeRow.arbitrationCost ?? null,
    extraData: disputeRow.extraData ?? null,
    creationBlock: disputeRow.creationBlock ?? null,
    goal: compactGoalSummary(context.goalRow, context.goalAddress),
    budget: compactBudgetSummary(context.budgetRow, context.budgetAddress),
    tcr:
      disputeRow.tcrAddress || disputeRow.tcrKind || disputeRow.itemId
        ? {
            address: disputeRow.tcrAddress ?? null,
            kind: disputeRow.tcrKind ?? null,
            itemId: disputeRow.itemId ?? null,
          }
        : null,
    request: context.requestRow
      ? {
          requestId: context.requestRow.id,
          requestIndex: context.requestRow.requestIndex ?? null,
          requestType: context.requestRow.requestType ?? null,
          requester: context.requestRow.requester ?? null,
          challenger: context.requestRow.challenger ?? null,
          submittedAt: toIsoTimestamp(context.requestRow.submittedAt),
          challengedAt: toIsoTimestamp(context.requestRow.challengedAt),
        }
      : null,
    timing: {
      votingStartAt: toIsoTimestamp(disputeRow.votingStartTime),
      votingEndAt: toIsoTimestamp(disputeRow.votingEndTime),
      revealEndAt: toIsoTimestamp(disputeRow.revealPeriodEndTime),
      executedAt: toIsoTimestamp(disputeRow.executedAt),
      updatedAt: toIsoTimestamp(disputeRow.updatedAtTimestamp),
    },
    juror: normalizedJuror
      ? {
          address: normalizedJuror,
          isAssigned: Boolean(selectedMember),
          snapshotWeight: selectedMember?.snapshotWeight ?? null,
          createdAt: toIsoTimestamp(selectedMember?.createdAtTimestamp),
          current: currentJurorRow
            ? {
                optedIn: Boolean(currentJurorRow.optedIn),
                currentWeight: currentJurorRow.currentJurorWeight ?? null,
                lockedGoalAmount: currentJurorRow.lockedGoalAmount ?? null,
                exitTime: toIsoTimestamp(currentJurorRow.exitTime),
                delegate: currentJurorRow.delegate ?? null,
                slasher: currentJurorRow.slasher ?? null,
                slashedTotal: currentJurorRow.slashedTotal ?? null,
                updatedAt: toIsoTimestamp(currentJurorRow.updatedAtTimestamp),
              }
            : null,
          receipts: receiptRows.map((row) => ({
            round: row.round ?? null,
            hasCommitted: Boolean(row.hasCommitted),
            hasRevealed: Boolean(row.hasRevealed),
            choice: row.choice ?? null,
            reasonText: row.reasonText ?? null,
            votes: row.votes ?? null,
            committedAt: toIsoTimestamp(row.committedAt),
            revealedAt: toIsoTimestamp(row.revealedAt),
            rewardAmount: row.rewardAmount ?? null,
            rewardWithdrawnAt: toIsoTimestamp(row.rewardWithdrawnAt),
            slashRewardGoalAmount: row.slashRewardGoalAmount ?? null,
            slashRewardCobuildAmount: row.slashRewardCobuildAmount ?? null,
            slashRewardsWithdrawnAt: toIsoTimestamp(row.slashRewardsWithdrawnAt),
            snapshotVotes: row.snapshotVotes ?? null,
            slashWeight: row.slashWeight ?? null,
            missedReveal: Boolean(row.missedReveal),
            slashRecipient: row.slashRecipient ?? null,
            slashedAt: toIsoTimestamp(row.slashedAt),
          })),
        }
      : null,
  };
  /* v8 ignore stop */
}

export async function inspectStakePosition(identifier: string, account: string) {
  const context = await resolveStakeContext(identifier);
  if (!context) return null;

  const normalizedAccount = normalizeAccountLookup(account);
  const positionRows =
    context.stakeVaultAddress
      ? await cobuildDb
          .select()
          .from(stakePosition)
          .where(
            and(
              eq(stakePosition.vault, context.stakeVaultAddress),
              eq(stakePosition.account, normalizedAccount),
            ),
          )
      : [];
  const jurorRow =
    context.stakeVaultAddress
      ? (
          await cobuildDb
            .select()
            .from(juror)
            .where(
              and(
                eq(juror.vault, context.stakeVaultAddress),
                eq(juror.jurorAddress, normalizedAccount),
              ),
            )
        )[0] ?? null
      : null;

  const goalPosition = positionRows.find((row) => row.tokenKind === "goal") ?? null;
  const cobuildPosition = positionRows.find((row) => row.tokenKind === "cobuild") ?? null;
  const vaultSummary = compactStakeVaultSummary(
    context.stakeVaultRow ?? {
      id: context.stakeVaultAddress ?? "",
      kind: context.goalAddress ? "goal" : context.budgetAddress ? "budget" : null,
      treasury: context.goalAddress ?? context.budgetAddress ?? null,
      resolved: null,
      goalTotalStaked: "0",
      goalTotalWithdrawn: "0",
      cobuildTotalStaked: "0",
      cobuildTotalWithdrawn: "0",
      updatedAtTimestamp: null,
    },
    context.stakeVaultAddress,
  );

  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    identifier: normalizeLookupIdentifier(identifier),
    account: normalizedAccount,
    vaultAddress: context.stakeVaultAddress,
    goal: compactGoalSummary(context.goalRow, context.goalAddress),
    budget: compactBudgetSummary(context.budgetRow, context.budgetAddress),
    vault: vaultSummary,
    accountState: {
      goal: {
        hasPosition: Boolean(goalPosition),
        staked: goalPosition?.staked ?? "0",
        withdrawn: goalPosition?.withdrawn ?? "0",
        netStaked: subtractAmounts(goalPosition?.staked, goalPosition?.withdrawn) ?? "0",
        updatedAt: toIsoTimestamp(goalPosition?.updatedAtTimestamp),
      },
      cobuild: {
        hasPosition: Boolean(cobuildPosition),
        staked: cobuildPosition?.staked ?? "0",
        withdrawn: cobuildPosition?.withdrawn ?? "0",
        netStaked: subtractAmounts(cobuildPosition?.staked, cobuildPosition?.withdrawn) ?? "0",
        updatedAt: toIsoTimestamp(cobuildPosition?.updatedAtTimestamp),
      },
    },
    juror: jurorRow
      ? {
          optedIn: Boolean(jurorRow.optedIn),
          currentWeight: jurorRow.currentJurorWeight ?? null,
          lockedGoalAmount: jurorRow.lockedGoalAmount ?? null,
          exitTime: toIsoTimestamp(jurorRow.exitTime),
          delegate: jurorRow.delegate ?? null,
          slasher: jurorRow.slasher ?? null,
          slashedTotal: jurorRow.slashedTotal ?? null,
          updatedAt: toIsoTimestamp(jurorRow.updatedAtTimestamp),
        }
      : null,
  };
  /* v8 ignore stop */
}

export async function inspectPremiumEscrow(identifier: string, account?: string) {
  const context = await resolvePremiumEscrowContext(identifier);
  if (!context) return null;

  const normalizedAccount = account ? normalizeAccountLookup(account) : null;
  const accountRow =
    normalizedAccount
      ? (
          await cobuildDb
            .select()
            .from(premiumAccount)
            .where(
              eq(
                premiumAccount.id,
                buildPremiumAccountId(context.premiumRow.id, normalizedAccount),
              ),
            )
        )[0] ?? null
      : null;

  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    identifier: normalizeLookupIdentifier(identifier),
    escrowAddress: context.premiumRow.id,
    goal: compactGoalSummary(context.goalRow, context.goalAddress),
    budget: compactBudgetSummary(
      context.budgetRow,
      context.budgetRow?.id ?? context.premiumRow.budgetTreasury ?? null,
    ),
    budgetStack:
      context.stackRow
        ? {
            id: context.stackRow.id,
            status: context.stackRow.status ?? null,
            childFlow: context.stackRow.childFlow ?? null,
            strategy: context.stackRow.strategy ?? null,
            budgetAddress: context.stackRow.budgetTreasury ?? null,
          }
        : null,
    state: {
      budgetTreasury: context.premiumRow.budgetTreasury ?? context.budgetRow?.id ?? null,
      childFlow: context.premiumRow.childFlow ?? context.stackRow?.childFlow ?? null,
      managerRewardPool: context.premiumRow.managerRewardPool ?? null,
      baselineReceived: context.premiumRow.baselineReceived ?? null,
      latestDistributedPremium: context.premiumRow.latestDistributedPremium ?? null,
      latestTotalCoverage: context.premiumRow.latestTotalCoverage ?? null,
      latestPremiumIndex: context.premiumRow.latestPremiumIndex ?? null,
      closed: Boolean(context.premiumRow.closed),
      finalState: context.premiumRow.finalState ?? null,
    },
    timing: {
      activatedAt: toIsoTimestamp(context.premiumRow.activatedAt),
      closedAt: toIsoTimestamp(context.premiumRow.closedAt),
      lastIndexedAt: toIsoTimestamp(context.premiumRow.lastIndexedAtTimestamp),
      updatedAt: toIsoTimestamp(context.premiumRow.updatedAtTimestamp),
    },
    account: normalizedAccount
      ? {
          address: normalizedAccount,
          hasAccountState: Boolean(accountRow),
          currentCoverage: accountRow?.currentCoverage ?? "0",
          claimableAmount: accountRow?.claimableAmount ?? "0",
          exposureIntegral: accountRow?.exposureIntegral ?? "0",
          slashed: Boolean(accountRow?.slashed),
          lastSlashWeight: accountRow?.lastSlashWeight ?? null,
          lastSlashDuration: accountRow?.lastSlashDuration ?? null,
          lastCheckpointAt: toIsoTimestamp(accountRow?.lastCheckpointTimestamp),
          updatedAt: toIsoTimestamp(accountRow?.updatedAtTimestamp),
        }
      : null,
  };
  /* v8 ignore stop */
}
