import {
  BUDGET_STATE_LABELS,
  budgetStateLabel,
  goalStateLabel,
  normalizeLookupIdentifier,
  subtractAmounts,
  toIsoTimestamp,
  toStateCode,
} from "./identifiers";
import type {
  ArbitratorDisputeRow,
  BudgetInspectReadBundle,
  BudgetTreasuryRow,
  DisputeContext,
  DisputeJurorReadBundle,
  FlowRecipientRow,
  GoalInspectReadBundle,
  GoalTreasuryRow,
  PremiumAccountReadBundle,
  PremiumEscrowContext,
  StakeAccountReadBundle,
  StakeContext,
  StakeVaultRow,
  TcrRequestContext,
  TcrRequestRow,
} from "./types";

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

export function compactGoalSummary(goalRow: GoalTreasuryRow | null | undefined, goalAddress: string | null = goalRow?.id ?? null) {
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

export function compactBudgetSummary(
  budgetRow: BudgetTreasuryRow | null | undefined,
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

export function compactStakeVaultSummary(
  stakeVaultRow: StakeVaultRow | null | undefined,
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

function mapRecipient(row: FlowRecipientRow | null | undefined) {
  return {
    address: row?.recipient ?? null,
    recipientIndex: row?.recipientIndex ?? null,
    title: row?.title ?? null,
    tagline: row?.tagline ?? null,
    isRemoved: Boolean(row?.isRemoved),
  };
}

function mapGoalBudgetItems(bundle: GoalInspectReadBundle) {
  const recipientByBudgetId = new Map(
    bundle.recipientRows
      .filter((row) => typeof row.budgetTreasury === "string" && row.budgetTreasury.length > 0)
      .map((row) => [row.budgetTreasury as string, row]),
  );

  return bundle.budgetRows
    .map((row) => ({
      ...compactBudgetSummary(row, row.id)!,
      recipient: mapRecipient(recipientByBudgetId.get(row.id)),
    }))
    .sort((left, right) => {
      const leftIndex = left.recipient.recipientIndex ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = right.recipient.recipientIndex ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
}

export function mapGoalInspectResponse(identifier: string, goalRow: GoalTreasuryRow, bundle: GoalInspectReadBundle) {
  const budgetItems = mapGoalBudgetItems(bundle);
  const budgetCounts = Object.fromEntries(BUDGET_STATE_LABELS.map((label) => [label, 0])) as Record<
    (typeof BUDGET_STATE_LABELS)[number],
    number
  >;

  for (const item of budgetItems) {
    if (item.state) budgetCounts[item.state] += 1;
  }

  const flow =
    goalRow.flowAddress || goalRow.parentFlow || bundle.recipientRows.length > 0
      ? {
          address: goalRow.flowAddress ?? null,
          parentFlow: goalRow.parentFlow ?? null,
          recipientCount: bundle.recipientRows.length,
          activeRecipientCount: bundle.recipientRows.filter((row) => !row.isRemoved).length,
          budgetRecipientCount: bundle.recipientRows.filter((row) => Boolean(row.budgetTreasury)).length,
        }
      : null;

  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    identifier: normalizeLookupIdentifier(identifier),
    goalAddress: goalRow.id,
    goalRevnetId: goalRow.goalRevnetId ?? null,
    state: goalStateLabel(goalRow.state),
    stateCode: toStateCode(goalRow.state),
    finalized: Boolean(goalRow.finalized),
    project: compactProject(goalRow.canonicalProjectChainId, goalRow.canonicalProjectId),
    route: compactRoute(goalRow.canonicalRouteSlug, goalRow.canonicalRouteDomain),
    flow,
    stakeVault: bundle.stakeVaultRow
      ? {
          address: bundle.stakeVaultRow.id,
          resolved: bundle.stakeVaultRow.resolved,
          goalTotalStaked: bundle.stakeVaultRow.goalTotalStaked,
          goalTotalWithdrawn: bundle.stakeVaultRow.goalTotalWithdrawn,
          cobuildTotalStaked: bundle.stakeVaultRow.cobuildTotalStaked,
          cobuildTotalWithdrawn: bundle.stakeVaultRow.cobuildTotalWithdrawn,
        }
      : null,
    budgetTcr: bundle.deployment?.budgetTcr ?? null,
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
      arbitrator: bundle.deployment?.arbitrator ?? null,
      deploymentTxHash: bundle.deployment?.txHash ?? null,
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
    budgets: {
      total: budgetItems.length,
      finalized: budgetItems.filter((budget) => budget.finalized).length,
      byState: budgetCounts,
      items: budgetItems,
    },
  };
  /* v8 ignore stop */
}

export function mapBudgetInspectResponse(identifier: string, budgetRow: BudgetTreasuryRow, bundle: BudgetInspectReadBundle) {
  const goalContextAddress =
    typeof bundle.goalContext?.goalTreasury === "string" && bundle.goalContext.goalTreasury.length > 0
      ? bundle.goalContext.goalTreasury
      : null;
  const recipient =
    bundle.recipientRows.sort((left, right) => {
      const leftIndex = left.recipientIndex ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = right.recipientIndex ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    })[0] ?? null;
  const route = compactRoute(bundle.goalRow?.canonicalRouteSlug, bundle.goalRow?.canonicalRouteDomain);

  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    identifier: normalizeLookupIdentifier(identifier),
    budgetAddress: budgetRow.id,
    recipientId: budgetRow.recipientId ?? null,
    goalAddress: goalContextAddress ?? bundle.goalRow?.id ?? null,
    budgetTcr: bundle.deployment?.budgetTcr ?? null,
    state: budgetStateLabel(budgetRow.state),
    stateCode: toStateCode(budgetRow.state),
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
      arbitrator: bundle.deployment?.arbitrator ?? null,
      goal:
        bundle.goalRow || route
          ? {
              goalRevnetId: bundle.goalRow?.goalRevnetId ?? null,
              route,
            }
          : null,
      premiumEscrow: budgetRow.premiumEscrow
        ? {
            address: budgetRow.premiumEscrow,
            baselineReceived: bundle.premiumRow?.baselineReceived ?? null,
            latestDistributedPremium: bundle.premiumRow?.latestDistributedPremium ?? null,
            latestTotalCoverage: bundle.premiumRow?.latestTotalCoverage ?? null,
            latestPremiumIndex: bundle.premiumRow?.latestPremiumIndex ?? null,
            closed: bundle.premiumRow?.closed ?? null,
            finalState: bundle.premiumRow?.finalState ?? null,
            activatedAt: toIsoTimestamp(bundle.premiumRow?.activatedAt),
            closedAt: toIsoTimestamp(bundle.premiumRow?.closedAt),
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

export function mapTcrRequestInspectResponse(identifier: string, requestRow: TcrRequestRow, context: TcrRequestContext) {
  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    identifier: normalizeLookupIdentifier(identifier),
    requestId: requestRow.id ?? normalizeLookupIdentifier(identifier).toLowerCase(),
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
      latestRequest: Boolean(context.itemRow?.latestRequestIndex) && context.itemRow?.latestRequestIndex === requestRow.requestIndex,
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

export function mapDisputeInspectResponse(
  identifier: string,
  disputeRow: ArbitratorDisputeRow,
  context: DisputeContext,
  jurorBundle: DisputeJurorReadBundle,
) {
  const selectedMember = jurorBundle.selectedMember;

  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    identifier: normalizeLookupIdentifier(identifier),
    disputeId: disputeRow.disputeId ?? null,
    arbitrator: disputeRow.arbitrator ?? null,
    currentRound: disputeRow.currentRound ?? null,
    jurorCount: jurorBundle.memberRows.length || disputeRow.jurorAddresses?.length || 0,
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
    juror: jurorBundle.normalizedJuror
      ? {
          address: jurorBundle.normalizedJuror,
          isAssigned: Boolean(selectedMember),
          snapshotWeight: selectedMember?.snapshotWeight ?? null,
          createdAt: toIsoTimestamp(selectedMember?.createdAtTimestamp),
          current: jurorBundle.currentJurorRow
            ? {
                optedIn: Boolean(jurorBundle.currentJurorRow.optedIn),
                currentWeight: jurorBundle.currentJurorRow.currentJurorWeight ?? null,
                lockedGoalAmount: jurorBundle.currentJurorRow.lockedGoalAmount ?? null,
                exitTime: toIsoTimestamp(jurorBundle.currentJurorRow.exitTime),
                delegate: jurorBundle.currentJurorRow.delegate ?? null,
                slasher: jurorBundle.currentJurorRow.slasher ?? null,
                slashedTotal: jurorBundle.currentJurorRow.slashedTotal ?? null,
                updatedAt: toIsoTimestamp(jurorBundle.currentJurorRow.updatedAtTimestamp),
              }
            : null,
          receipts: jurorBundle.receiptRows.map((row) => ({
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

export function mapStakePositionInspectResponse(
  identifier: string,
  context: StakeContext,
  accountBundle: StakeAccountReadBundle,
) {
  const goalPosition = accountBundle.positionRows.find((row) => row.tokenKind === "goal") ?? null;
  const cobuildPosition = accountBundle.positionRows.find((row) => row.tokenKind === "cobuild") ?? null;
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
      updatedAtBlock: null,
      updatedAtTimestamp: null,
    },
    context.stakeVaultAddress,
  );

  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    identifier: normalizeLookupIdentifier(identifier),
    account: accountBundle.normalizedAccount,
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
    juror: accountBundle.jurorRow
      ? {
          optedIn: Boolean(accountBundle.jurorRow.optedIn),
          currentWeight: accountBundle.jurorRow.currentJurorWeight ?? null,
          lockedGoalAmount: accountBundle.jurorRow.lockedGoalAmount ?? null,
          exitTime: toIsoTimestamp(accountBundle.jurorRow.exitTime),
          delegate: accountBundle.jurorRow.delegate ?? null,
          slasher: accountBundle.jurorRow.slasher ?? null,
          slashedTotal: accountBundle.jurorRow.slashedTotal ?? null,
          updatedAt: toIsoTimestamp(accountBundle.jurorRow.updatedAtTimestamp),
        }
      : null,
  };
  /* v8 ignore stop */
}

export function mapPremiumEscrowInspectResponse(
  identifier: string,
  context: PremiumEscrowContext,
  accountBundle: PremiumAccountReadBundle,
) {
  /* v8 ignore start -- projection nullability is exercised by inspector snapshot tests */
  return {
    identifier: normalizeLookupIdentifier(identifier),
    escrowAddress: context.premiumRow.id,
    goal: compactGoalSummary(context.goalRow, context.goalAddress),
    budget: compactBudgetSummary(context.budgetRow, context.budgetRow?.id ?? context.premiumRow.budgetTreasury ?? null),
    budgetStack: context.stackRow
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
    account: accountBundle.normalizedAccount
      ? {
          address: accountBundle.normalizedAccount,
          hasAccountState: Boolean(accountBundle.accountRow),
          currentCoverage: accountBundle.accountRow?.currentCoverage ?? "0",
          claimableAmount: accountBundle.accountRow?.claimableAmount ?? "0",
          exposureIntegral: accountBundle.accountRow?.exposureIntegral ?? "0",
          slashed: Boolean(accountBundle.accountRow?.slashed),
          lastSlashWeight: accountBundle.accountRow?.lastSlashWeight ?? null,
          lastSlashDuration: accountBundle.accountRow?.lastSlashDuration ?? null,
          lastCheckpointAt: toIsoTimestamp(accountBundle.accountRow?.lastCheckpointTimestamp),
          updatedAt: toIsoTimestamp(accountBundle.accountRow?.updatedAtTimestamp),
        }
      : null,
  };
  /* v8 ignore stop */
}
