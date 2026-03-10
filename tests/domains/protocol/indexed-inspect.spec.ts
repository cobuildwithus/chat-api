import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("../../../src/infra/db/cobuildDb", () => ({
  cobuildDb: {
    select: mocks.select,
  },
}));

import {
  inspectBudget,
  inspectDispute,
  inspectGoal,
  inspectPremiumEscrow,
  inspectStakePosition,
  inspectTcrRequest,
} from "../../../src/domains/protocol/indexed-inspect";

function queueSelectRows(...rowsQueue: unknown[][]) {
  let index = 0;
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => Promise.resolve(rowsQueue[index++] ?? []),
    }),
  }));
}

describe("indexed protocol inspect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for blank goal identifiers without hitting the database", async () => {
    await expect(inspectGoal("   ")).resolves.toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns null for other blank protocol inspect identifiers without hitting the database", async () => {
    await expect(inspectBudget("   ")).resolves.toBeNull();
    await expect(inspectTcrRequest("   ")).resolves.toBeNull();
    await expect(inspectDispute("   ")).resolves.toBeNull();
    await expect(
      inspectStakePosition("   ", "0x00000000000000000000000000000000000000Bb"),
    ).resolves.toBeNull();
    await expect(inspectPremiumEscrow("   ")).resolves.toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("inspects goals by address and compacts missing optional indexed state", async () => {
    queueSelectRows(
      [
        {
          id: "0x00000000000000000000000000000000000000aa",
          owner: null,
          flowAddress: null,
          stakeVault: null,
          goalRevnetId: null,
          canonicalProjectChainId: null,
          canonicalProjectId: null,
          canonicalRouteSlug: null,
          canonicalRouteDomain: null,
          minRaiseDeadline: "not-a-timestamp",
          deadline: null,
          minRaise: null,
          parentFlow: null,
          state: 99,
          finalized: true,
          successAssertionRegisteredAt: null,
          reassertGraceDeadline: null,
          successAt: "0",
          lastSyncedTargetRate: null,
          lastSyncedAppliedRate: null,
          lastSyncedTreasuryBalance: null,
          lastSyncedTimeRemaining: null,
          lastResidualFinalState: null,
          lastResidualSettledAmount: null,
          lastResidualControllerBurnAmount: null,
          createdAtTimestamp: "oops",
          updatedAtTimestamp: null,
        },
      ],
      [],
      [],
    );

    await expect(
      inspectGoal("0x00000000000000000000000000000000000000AA"),
    ).resolves.toEqual({
      identifier: "0x00000000000000000000000000000000000000AA",
      goalAddress: "0x00000000000000000000000000000000000000aa",
      goalRevnetId: null,
      state: null,
      stateCode: 99,
      finalized: true,
      project: null,
      route: null,
      flow: null,
      stakeVault: null,
      budgetTcr: null,
      treasury: {
        owner: null,
        minRaise: null,
        minRaiseDeadline: null,
        deadline: null,
        successAt: "1970-01-01T00:00:00.000Z",
        lastSyncedTargetRate: null,
        lastSyncedAppliedRate: null,
        lastSyncedTreasuryBalance: null,
        lastSyncedTimeRemaining: null,
        lastResidualFinalState: null,
        lastResidualSettledAmount: null,
        lastResidualControllerBurnAmount: null,
        createdAt: null,
        updatedAt: null,
      },
      governance: {
        arbitrator: null,
        deploymentTxHash: null,
      },
      timing: {
        minRaiseDeadline: null,
        deadline: null,
        reassertGraceDeadline: null,
        successAt: "1970-01-01T00:00:00.000Z",
        successAssertionRegisteredAt: null,
        createdAt: null,
        updatedAt: null,
      },
      budgets: {
        total: 0,
        finalized: 0,
        byState: {
          Funding: 0,
          Active: 0,
          Succeeded: 0,
          Failed: 0,
          Expired: 0,
        },
        items: [],
      },
    });
    expect(mocks.select).toHaveBeenCalledTimes(3);
  });

  it("inspects goals by route slug with populated flow, deployment, and budget summaries", async () => {
    queueSelectRows(
      [
        {
          id: "0xgoal",
          owner: "0xowner",
          flowAddress: "0xflow",
          stakeVault: "0xvault",
          goalRevnetId: "42",
          canonicalProjectChainId: 8453,
          canonicalProjectId: 7,
          canonicalRouteSlug: "alpha",
          canonicalRouteDomain: "alpha.cobuild.eth",
          minRaiseDeadline: null,
          deadline: null,
          minRaise: "1000",
          parentFlow: "0xparent",
          state: 1,
          finalized: false,
          successAssertionRegisteredAt: null,
          reassertGraceDeadline: null,
          successAt: null,
          lastSyncedTargetRate: "11",
          lastSyncedAppliedRate: "10",
          lastSyncedTreasuryBalance: "999",
          lastSyncedTimeRemaining: "77",
          lastResidualFinalState: 2,
          lastResidualSettledAmount: "5",
          lastResidualControllerBurnAmount: "1",
          createdAtTimestamp: null,
          updatedAtTimestamp: null,
        },
      ],
      [
        {
          budgetTcr: "0xtcr",
          arbitrator: "0xarbitrator",
          txHash: "0xdeploy",
        },
      ],
      [
        { id: "0xbudget2" },
        { id: "0xbudget1" },
      ],
      [
        {
          budgetTreasury: "0xbudget2",
          recipient: "0xrecipient2",
          recipientIndex: 2,
          title: "Budget Two",
          tagline: "Ship",
          isRemoved: false,
        },
        {
          budgetTreasury: "0xbudget1",
          recipient: "0xrecipient1",
          recipientIndex: 1,
          title: "Budget One",
          tagline: null,
          isRemoved: true,
        },
      ],
      [
        {
          id: "0xvault",
          resolved: false,
          goalTotalStaked: "300",
          goalTotalWithdrawn: "20",
          cobuildTotalStaked: "90",
          cobuildTotalWithdrawn: "10",
        },
      ],
      [
        {
          id: "0xbudget1",
          recipientId: "0xitem1",
          childFlow: null,
          premiumEscrow: null,
          state: 0,
          finalized: false,
        },
        {
          id: "0xbudget2",
          recipientId: "0xitem2",
          childFlow: "0xchild2",
          premiumEscrow: "0xescrow2",
          state: 2,
          finalized: true,
        },
      ],
    );

    await expect(inspectGoal("alpha")).resolves.toMatchObject({
      identifier: "alpha",
      goalAddress: "0xgoal",
      goalRevnetId: "42",
      state: "Active",
      project: {
        chainId: 8453,
        projectId: 7,
      },
      flow: {
        address: "0xflow",
        parentFlow: "0xparent",
        recipientCount: 2,
        activeRecipientCount: 1,
        budgetRecipientCount: 2,
      },
      stakeVault: {
        address: "0xvault",
        resolved: false,
        goalTotalStaked: "300",
        goalTotalWithdrawn: "20",
        cobuildTotalStaked: "90",
        cobuildTotalWithdrawn: "10",
      },
      budgetTcr: "0xtcr",
      governance: {
        arbitrator: "0xarbitrator",
        deploymentTxHash: "0xdeploy",
      },
      budgets: {
        total: 2,
        finalized: 1,
        byState: {
          Funding: 1,
          Active: 0,
          Succeeded: 1,
          Failed: 0,
          Expired: 0,
        },
        items: [
          {
            budgetAddress: "0xbudget1",
            recipient: {
              address: "0xrecipient1",
              recipientIndex: 1,
              title: "Budget One",
              isRemoved: true,
            },
          },
          {
            budgetAddress: "0xbudget2",
            recipient: {
              address: "0xrecipient2",
              recipientIndex: 2,
              title: "Budget Two",
              tagline: "Ship",
              isRemoved: false,
            },
          },
        ],
      },
    });
    expect(mocks.select).toHaveBeenCalledTimes(6);
  });

  it("throws for ambiguous goal route keys without fanning out into bundle reads", async () => {
    queueSelectRows([
      {
        id: "0xgoal1",
        canonicalRouteSlug: "alpha",
        canonicalRouteDomain: "goal-one.cobuild.eth",
      },
      {
        id: "0xgoal2",
        canonicalRouteSlug: "beta",
        canonicalRouteDomain: "alpha",
      },
    ]);

    await expect(inspectGoal("alpha")).rejects.toThrow(
      'Goal identifier "alpha" matched multiple canonical routes.',
    );
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("returns null for missing goal route keys after a single indexed lookup", async () => {
    queueSelectRows([]);

    await expect(inspectGoal("missing-goal")).resolves.toBeNull();
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("returns null for non-address, non-recipient budget identifiers without database access", async () => {
    await expect(inspectBudget("budget-alpha")).resolves.toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("inspects budgets by address and omits absent goal, flow, and premium relations", async () => {
    queueSelectRows(
      [
        {
          id: "0x00000000000000000000000000000000000000bb",
          controller: null,
          recipientId: null,
          childFlow: null,
          premiumEscrow: null,
          fundingDeadline: "invalid",
          executionDuration: null,
          activationThreshold: null,
          runwayCap: null,
          state: -1,
          finalized: false,
          successAssertionRegisteredAt: null,
          successResolutionDisabled: null,
          reassertGraceDeadline: null,
          lastSyncedTargetRate: null,
          lastSyncedAppliedRate: null,
          lastSyncedTreasuryBalance: null,
          lastSyncedTimeRemaining: null,
          lastResidualDestination: null,
          lastResidualSettledAmount: null,
          createdAtTimestamp: null,
          updatedAtTimestamp: null,
        },
      ],
      [],
      [],
    );

    await expect(
      inspectBudget("0x00000000000000000000000000000000000000BB"),
    ).resolves.toEqual({
      identifier: "0x00000000000000000000000000000000000000BB",
      budgetAddress: "0x00000000000000000000000000000000000000bb",
      recipientId: null,
      goalAddress: null,
      budgetTcr: null,
      state: null,
      stateCode: -1,
      finalized: false,
      treasury: {
        controller: null,
        activationThreshold: null,
        runwayCap: null,
        fundingDeadline: null,
        executionDurationSeconds: null,
        successResolutionDisabled: false,
        lastSyncedTargetRate: null,
        lastSyncedAppliedRate: null,
        lastSyncedTreasuryBalance: null,
        lastSyncedTimeRemaining: null,
        lastResidualDestination: null,
        lastResidualSettledAmount: null,
        createdAt: null,
        updatedAt: null,
      },
      flow: null,
      governance: {
        arbitrator: null,
        goal: null,
        premiumEscrow: null,
      },
      timing: {
        fundingDeadline: null,
        reassertGraceDeadline: null,
        successAssertionRegisteredAt: null,
        createdAt: null,
        updatedAt: null,
      },
    });
    expect(mocks.select).toHaveBeenCalledTimes(3);
  });

  it("inspects budgets by recipient id with populated goal, flow, and premium relations", async () => {
    queueSelectRows(
      [
        {
          id: "0xbudget",
          controller: "0xcontroller",
          recipientId: "0xrecipientid1234",
          childFlow: "0xchild",
          premiumEscrow: "0xescrow",
          fundingDeadline: null,
          executionDuration: "600",
          activationThreshold: "50",
          runwayCap: "999",
          state: 1,
          finalized: false,
          successAssertionRegisteredAt: null,
          successResolutionDisabled: true,
          reassertGraceDeadline: null,
          lastSyncedTargetRate: "4",
          lastSyncedAppliedRate: "3",
          lastSyncedTreasuryBalance: "500",
          lastSyncedTimeRemaining: "44",
          lastResidualDestination: "0xdest",
          lastResidualSettledAmount: "2",
          createdAtTimestamp: null,
          updatedAtTimestamp: null,
        },
      ],
      [
        {
          id: "0xbudget",
          goalTreasury: "0xgoal",
        },
      ],
      [
        {
          recipient: "0xrecipient",
          recipientIndex: 9,
          title: "Builder Budget",
          tagline: "Fund it",
          isRemoved: false,
        },
      ],
      [
        {
          id: "0xescrow",
          baselineReceived: "100",
          latestDistributedPremium: "7",
          latestTotalCoverage: "33",
          latestPremiumIndex: "2",
          closed: false,
          finalState: 1,
          activatedAt: null,
          closedAt: null,
        },
      ],
      [
        {
          id: "0xgoal",
          goalRevnetId: "42",
          canonicalRouteSlug: "alpha",
          canonicalRouteDomain: "alpha.cobuild.eth",
        },
      ],
      [
        {
          budgetTcr: "0xtcr",
          arbitrator: "0xarbitrator",
        },
      ],
    );

    await expect(inspectBudget("0xrecipientid1234")).resolves.toMatchObject({
      identifier: "0xrecipientid1234",
      budgetAddress: "0xbudget",
      goalAddress: "0xgoal",
      budgetTcr: "0xtcr",
      state: "Active",
      treasury: {
        controller: "0xcontroller",
        activationThreshold: "50",
        runwayCap: "999",
        executionDurationSeconds: "600",
        successResolutionDisabled: true,
        lastResidualDestination: "0xdest",
      },
      flow: {
        childFlow: "0xchild",
        recipientAddress: "0xrecipient",
        recipientIndex: 9,
        title: "Builder Budget",
        tagline: "Fund it",
        isRemoved: false,
      },
      governance: {
        arbitrator: "0xarbitrator",
        goal: {
          goalRevnetId: "42",
          route: {
            slug: "alpha",
            domain: "alpha.cobuild.eth",
          },
        },
        premiumEscrow: {
          address: "0xescrow",
          baselineReceived: "100",
          latestDistributedPremium: "7",
          latestTotalCoverage: "33",
          latestPremiumIndex: "2",
          closed: false,
          finalState: 1,
        },
      },
    });
    expect(mocks.select).toHaveBeenCalledTimes(6);
  });

  it("inspects TCR requests by composite identifier", async () => {
    queueSelectRows(
      [
        {
          id: "0xtcr:0xitem:2",
          tcrAddress: "0xtcr",
          tcrKind: "budget",
          itemId: "0xitem",
          requestIndex: "2",
          goalTreasury: "0xgoal",
          budgetTreasury: "0xbudget",
          requestType: "registration",
          requester: "0xrequester",
          challenger: "0xchallenger",
          disputeId: "7",
          submittedAt: "1713000000",
          challengedAt: "1713000300",
          txHash: "0xtx",
          updatedAtTimestamp: "1713000400",
        },
      ],
      [
        {
          id: "0xtcr:0xitem",
          currentStatus: 3,
          evidenceGroupId: "9",
          submitter: "0xsubmitter",
          latestRequestIndex: "2",
          tcrKind: "budget",
        },
      ],
      [
        {
          id: "0xbudget",
          recipientId: "0xitem",
          childFlow: "0xchild",
          premiumEscrow: "0xescrow",
          state: 1,
          finalized: false,
        },
      ],
      [
        {
          id: "0xgoal",
          goalRevnetId: "42",
          state: 1,
          finalized: false,
          canonicalRouteSlug: "alpha",
          canonicalRouteDomain: "alpha.cobuild.eth",
          stakeVault: "0xvault",
        },
      ],
      [
        {
          id: "0xarbitrator:7",
          arbitrator: "0xarbitrator",
          disputeId: "7",
          currentRound: "1",
          ruling: 2,
          executedAt: "1713000500",
          stakeVault: "0xvault",
        },
      ],
    );

    await expect(inspectTcrRequest("0xTcr:0xItem:2")).resolves.toEqual({
      identifier: "0xTcr:0xItem:2",
      requestId: "0xtcr:0xitem:2",
      requestIndex: "2",
      requestType: "registration",
      tcr: {
        address: "0xtcr",
        kind: "budget",
      },
      goal: {
        goalAddress: "0xgoal",
        goalRevnetId: "42",
        state: "Active",
        stateCode: 1,
        finalized: false,
        route: {
          slug: "alpha",
          domain: "alpha.cobuild.eth",
        },
        stakeVault: "0xvault",
      },
      budget: {
        budgetAddress: "0xbudget",
        recipientId: "0xitem",
        state: "Active",
        stateCode: 1,
        finalized: false,
        childFlow: "0xchild",
        premiumEscrow: "0xescrow",
      },
      item: {
        itemId: "0xitem",
        currentStatus: 3,
        evidenceGroupId: "9",
        submitter: "0xsubmitter",
        latestRequestIndex: "2",
        latestRequest: true,
      },
      actors: {
        requester: "0xrequester",
        challenger: "0xchallenger",
      },
      dispute: {
        identifier: "0xarbitrator:7",
        arbitrator: "0xarbitrator",
        disputeId: "7",
        currentRound: "1",
        ruling: 2,
        executedAt: "2024-04-13T09:28:20.000Z",
      },
      timing: {
        submittedAt: "2024-04-13T09:20:00.000Z",
        challengedAt: "2024-04-13T09:25:00.000Z",
        updatedAt: "2024-04-13T09:26:40.000Z",
      },
      txHash: "0xtx",
    });
    expect(mocks.select).toHaveBeenCalledTimes(5);
  });

  it("inspects mechanism TCR requests through mechanism context fallback", async () => {
    queueSelectRows(
      [
        {
          id: "0xmechtcr:0xitem:0",
          tcrAddress: "0xmechtcr",
          tcrKind: "mechanism",
          itemId: "0xitem",
          requestIndex: "0",
          goalTreasury: null,
          budgetTreasury: null,
          requestType: "registration",
          requester: "0xrequester",
          challenger: null,
          disputeId: null,
          submittedAt: null,
          challengedAt: null,
          txHash: "0xtx",
          updatedAtTimestamp: null,
        },
      ],
      [
        {
          id: "0xmechtcr:0xitem",
          currentStatus: 1,
          evidenceGroupId: "4",
          submitter: "0xsubmitter",
          latestRequestIndex: "1",
          goalTreasury: null,
          budgetTreasury: null,
        },
      ],
      [
        {
          goalTreasury: "0xgoal",
          budgetTreasury: "0xbudget",
          budgetTcr: "0xbudgettcr",
        },
      ],
      [
        {
          id: "0xbudget",
          recipientId: "0xitem",
          childFlow: null,
          premiumEscrow: null,
          state: 1,
          finalized: false,
        },
      ],
      [
        {
          id: "0xgoal",
          goalRevnetId: "99",
          state: 2,
          finalized: true,
          canonicalRouteSlug: "gamma",
          canonicalRouteDomain: null,
          stakeVault: null,
        },
      ],
    );

    await expect(inspectTcrRequest("0xMechTcr:0xItem:0")).resolves.toMatchObject({
      identifier: "0xMechTcr:0xItem:0",
      requestId: "0xmechtcr:0xitem:0",
      tcr: {
        address: "0xmechtcr",
        kind: "mechanism",
      },
      goal: {
        goalAddress: "0xgoal",
        goalRevnetId: "99",
        state: "Succeeded",
        finalized: true,
      },
      budget: {
        budgetAddress: "0xbudget",
        recipientId: "0xitem",
        state: "Active",
      },
      item: {
        latestRequest: false,
      },
      dispute: null,
      txHash: "0xtx",
    });
    expect(mocks.select).toHaveBeenCalledTimes(5);
  });

  it("inspects disputes with optional juror detail", async () => {
    queueSelectRows(
      [
        {
          id: "0xarbitrator:7",
          arbitrator: "0xarbitrator",
          tcrAddress: "0xtcr",
          tcrKind: "budget",
          itemId: "0xitem",
          requestIndex: "2",
          disputeId: "7",
          currentRound: "1",
          jurorAddresses: ["0xjuror"],
          budgetTreasury: "0xbudget",
          goalTreasury: "0xgoal",
          stakeVault: "0xvault",
          ruling: 2,
          choices: "2",
          arbitrationCost: "100",
          extraData: "0xextra",
          creationBlock: "123",
          votingStartTime: "1713000000",
          votingEndTime: "1713000600",
          revealPeriodEndTime: "1713001200",
          executedAt: "1713001800",
          updatedAtTimestamp: "1713002000",
        },
      ],
      [
        {
          id: "0xtcr:0xitem:2",
          tcrAddress: "0xtcr",
          tcrKind: "budget",
          itemId: "0xitem",
          requestIndex: "2",
          requestType: "registration",
          requester: "0xrequester",
          challenger: "0xchallenger",
          submittedAt: "1712999000",
          challengedAt: "1712999500",
        },
      ],
      [
        {
          id: "0xbudget",
          recipientId: "0xitem",
          childFlow: "0xchild",
          premiumEscrow: "0xescrow",
          state: 2,
          finalized: false,
        },
      ],
      [
        {
          id: "0xgoal",
          goalRevnetId: "42",
          state: 1,
          finalized: false,
          canonicalRouteSlug: "alpha",
          canonicalRouteDomain: "alpha.cobuild.eth",
          stakeVault: "0xvault",
        },
      ],
      [
        {
          id: "0xarbitrator:7:0x00000000000000000000000000000000000000aa",
          snapshotWeight: "11",
          createdAtTimestamp: "1713000100",
        },
      ],
      [
        {
          id: "0xvault:0x00000000000000000000000000000000000000aa",
          optedIn: true,
          currentJurorWeight: "13",
          lockedGoalAmount: "21",
          exitTime: "1713100000",
          delegate: "0xdelegate",
          slasher: "0xslasher",
          slashedTotal: "1",
          updatedAtTimestamp: "1713003000",
        },
      ],
      [
        {
          round: "0",
          hasCommitted: true,
          hasRevealed: true,
          choice: "1",
          reasonText: "ship it",
          votes: "13",
          committedAt: "1713000200",
          revealedAt: "1713000800",
          rewardAmount: "2",
          rewardWithdrawnAt: null,
          slashRewardGoalAmount: null,
          slashRewardCobuildAmount: null,
          slashRewardsWithdrawnAt: null,
          snapshotVotes: "13",
          slashWeight: null,
          missedReveal: false,
          slashRecipient: null,
          slashedAt: null,
        },
      ],
    );

    await expect(
      inspectDispute("0xArbitrator:7", "0x00000000000000000000000000000000000000Aa"),
    ).resolves.toEqual({
      identifier: "0xArbitrator:7",
      disputeId: "7",
      arbitrator: "0xarbitrator",
      currentRound: "1",
      jurorCount: 1,
      ruling: 2,
      choices: "2",
      arbitrationCost: "100",
      extraData: "0xextra",
      creationBlock: "123",
      goal: {
        goalAddress: "0xgoal",
        goalRevnetId: "42",
        state: "Active",
        stateCode: 1,
        finalized: false,
        route: {
          slug: "alpha",
          domain: "alpha.cobuild.eth",
        },
        stakeVault: "0xvault",
      },
      budget: {
        budgetAddress: "0xbudget",
        recipientId: "0xitem",
        state: "Succeeded",
        stateCode: 2,
        finalized: false,
        childFlow: "0xchild",
        premiumEscrow: "0xescrow",
      },
      tcr: {
        address: "0xtcr",
        kind: "budget",
        itemId: "0xitem",
      },
      request: {
        requestId: "0xtcr:0xitem:2",
        requestIndex: "2",
        requestType: "registration",
        requester: "0xrequester",
        challenger: "0xchallenger",
        submittedAt: "2024-04-13T09:03:20.000Z",
        challengedAt: "2024-04-13T09:11:40.000Z",
      },
      timing: {
        votingStartAt: "2024-04-13T09:20:00.000Z",
        votingEndAt: "2024-04-13T09:30:00.000Z",
        revealEndAt: "2024-04-13T09:40:00.000Z",
        executedAt: "2024-04-13T09:50:00.000Z",
        updatedAt: "2024-04-13T09:53:20.000Z",
      },
      juror: {
        address: "0x00000000000000000000000000000000000000aa",
        isAssigned: true,
        snapshotWeight: "11",
        createdAt: "2024-04-13T09:21:40.000Z",
        current: {
          optedIn: true,
          currentWeight: "13",
          lockedGoalAmount: "21",
          exitTime: "2024-04-14T13:06:40.000Z",
          delegate: "0xdelegate",
          slasher: "0xslasher",
          slashedTotal: "1",
          updatedAt: "2024-04-13T10:10:00.000Z",
        },
        receipts: [
          {
            round: "0",
            hasCommitted: true,
            hasRevealed: true,
            choice: "1",
            reasonText: "ship it",
            votes: "13",
            committedAt: "2024-04-13T09:23:20.000Z",
            revealedAt: "2024-04-13T09:33:20.000Z",
            rewardAmount: "2",
            rewardWithdrawnAt: null,
            slashRewardGoalAmount: null,
            slashRewardCobuildAmount: null,
            slashRewardsWithdrawnAt: null,
            snapshotVotes: "13",
            slashWeight: null,
            missedReveal: false,
            slashRecipient: null,
            slashedAt: null,
          },
        ],
      },
    });
    expect(mocks.select).toHaveBeenCalledTimes(7);
  });

  it("inspects disputes through arbitrator goal context without juror detail", async () => {
    queueSelectRows(
      [
        {
          id: "0xarb:9",
          arbitrator: "0xarb",
          goalTreasury: null,
          budgetTreasury: null,
          stakeVault: null,
          tcrAddress: null,
          tcrKind: null,
          itemId: null,
          requestIndex: null,
          disputeId: "9",
          currentRound: "0",
          jurorAddresses: [],
          votingStartTime: null,
          votingEndTime: null,
          revealPeriodEndTime: null,
          creationBlock: null,
          arbitrationCost: null,
          extraData: null,
          choices: null,
          ruling: null,
          executedAt: null,
          updatedAtTimestamp: null,
        },
      ],
      [
        {
          id: "0xarb",
          goalTreasury: "0xgoal",
          stakeVault: "0xvault",
          budgetTcr: "0xtcr",
        },
      ],
      [
        {
          id: "0xgoal",
          goalRevnetId: "11",
          state: 0,
          finalized: false,
          canonicalRouteSlug: "delta",
          canonicalRouteDomain: null,
          stakeVault: "0xvault",
        },
      ],
      [],
    );

    await expect(inspectDispute("0xArb:9")).resolves.toMatchObject({
      identifier: "0xArb:9",
      disputeId: "9",
      arbitrator: "0xarb",
      jurorCount: 0,
      goal: {
        goalAddress: "0xgoal",
        state: "Funding",
        stakeVault: "0xvault",
      },
      budget: null,
      tcr: null,
      request: null,
      juror: null,
    });
    expect(mocks.select).toHaveBeenCalledTimes(4);
  });

  it("falls back to request-linked goal and budget addresses when a dispute row omits them", async () => {
    queueSelectRows(
      [
        {
          id: "0xarb:10",
          arbitrator: "0xarb",
          goalTreasury: null,
          budgetTreasury: null,
          stakeVault: null,
          tcrAddress: "0xtcr",
          tcrKind: "budget",
          itemId: "0xitem",
          requestIndex: "1",
          disputeId: "10",
          currentRound: "0",
          jurorAddresses: [],
        },
      ],
      [
        {
          id: "0xtcr:0xitem:1",
          goalTreasury: "0xgoal",
          budgetTreasury: "0xbudget",
          requestIndex: "1",
          requestType: "registration",
        },
      ],
      [
        {
          id: "0xbudget",
          recipientId: "0xitem",
          childFlow: null,
          premiumEscrow: null,
          state: 1,
          finalized: false,
        },
      ],
      [
        {
          id: "0xgoal",
          goalRevnetId: "1",
          state: 1,
          finalized: false,
          canonicalRouteSlug: "epsilon",
          canonicalRouteDomain: null,
          stakeVault: null,
        },
      ],
      [],
    );

    await expect(inspectDispute("0xArb:10")).resolves.toMatchObject({
      goal: {
        goalAddress: "0xgoal",
      },
      budget: {
        budgetAddress: "0xbudget",
      },
      request: {
        requestId: "0xtcr:0xitem:1",
      },
    });
    expect(mocks.select).toHaveBeenCalledTimes(6);
  });

  it("inspects budget TCR requests through goal-context fallback when the request row omits the goal", async () => {
    queueSelectRows(
      [
        {
          id: "0xbudgettcr:0xitem:0",
          tcrAddress: "0xbudgettcr",
          tcrKind: "budget",
          itemId: "0xitem",
          requestIndex: "0",
          goalTreasury: null,
          budgetTreasury: "0xbudget",
          requestType: "registration",
          requester: "0xrequester",
          challenger: null,
          disputeId: null,
          submittedAt: null,
          challengedAt: null,
          txHash: "0xtx",
          updatedAtTimestamp: null,
        },
      ],
      [
        {
          id: "0xbudgettcr:0xitem",
          currentStatus: 1,
          evidenceGroupId: null,
          submitter: "0xsubmitter",
          latestRequestIndex: "0",
          goalTreasury: null,
          budgetTreasury: null,
        },
      ],
      [
        {
          id: "0xbudgettcr",
          goalTreasury: "0xgoal",
        },
      ],
      [
        {
          id: "0xbudget",
          recipientId: "0xitem",
          childFlow: null,
          premiumEscrow: null,
          state: 0,
          finalized: false,
        },
      ],
      [
        {
          id: "0xgoal",
          goalRevnetId: "55",
          state: 1,
          finalized: false,
          canonicalRouteSlug: "theta",
          canonicalRouteDomain: null,
          stakeVault: "0xvault",
        },
      ],
    );

    await expect(inspectTcrRequest("0xBudgetTcr:0xItem:0")).resolves.toMatchObject({
      identifier: "0xBudgetTcr:0xItem:0",
      requestId: "0xbudgettcr:0xitem:0",
      goal: {
        goalAddress: "0xgoal",
        goalRevnetId: "55",
        route: {
          slug: "theta",
          domain: null,
        },
      },
      budget: {
        budgetAddress: "0xbudget",
        recipientId: "0xitem",
      },
      dispute: null,
      txHash: "0xtx",
    });
    expect(mocks.select).toHaveBeenCalledTimes(5);
  });

  it("returns sparse TCR request context when no goal, budget, or dispute can be derived", async () => {
    queueSelectRows([
      {
        id: "plain-request",
        tcrAddress: null,
        tcrKind: null,
        itemId: null,
        requestIndex: "0",
        goalTreasury: null,
        budgetTreasury: null,
        requestType: "registration",
        requester: "0xrequester",
        challenger: null,
        disputeId: null,
        submittedAt: null,
        challengedAt: null,
        txHash: null,
        updatedAtTimestamp: null,
      },
    ]);

    await expect(inspectTcrRequest("PLAIN-REQUEST")).resolves.toEqual({
      identifier: "PLAIN-REQUEST",
      requestId: "plain-request",
      requestIndex: "0",
      requestType: "registration",
      tcr: {
        address: null,
        kind: null,
      },
      goal: null,
      budget: null,
      item: {
        itemId: null,
        currentStatus: null,
        evidenceGroupId: null,
        submitter: null,
        latestRequestIndex: null,
        latestRequest: false,
      },
      actors: {
        requester: "0xrequester",
        challenger: null,
      },
      dispute: null,
      timing: {
        submittedAt: null,
        challengedAt: null,
        updatedAt: null,
      },
      txHash: null,
    });
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("returns zeroed stake account state when the entity resolves without account rows", async () => {
    queueSelectRows(
      [
        {
          id: "0x00000000000000000000000000000000000000aa",
          goalRevnetId: "42",
          state: 1,
          finalized: false,
          canonicalRouteSlug: "alpha",
          canonicalRouteDomain: "alpha.cobuild.eth",
          stakeVault: "0xstakevault",
        },
      ],
      [],
      [],
      [],
      [],
    );

    await expect(
      inspectStakePosition(
        "0x00000000000000000000000000000000000000Aa",
        "0x00000000000000000000000000000000000000Bb",
      ),
    ).resolves.toEqual({
      identifier: "0x00000000000000000000000000000000000000Aa",
      account: "0x00000000000000000000000000000000000000bb",
      vaultAddress: "0xstakevault",
      goal: {
        goalAddress: "0x00000000000000000000000000000000000000aa",
        goalRevnetId: "42",
        state: "Active",
        stateCode: 1,
        finalized: false,
        route: {
          slug: "alpha",
          domain: "alpha.cobuild.eth",
        },
        stakeVault: "0xstakevault",
      },
      budget: null,
      vault: {
        kind: "goal",
        treasury: "0x00000000000000000000000000000000000000aa",
        resolved: null,
        goalTotalStaked: "0",
        goalTotalWithdrawn: "0",
        cobuildTotalStaked: "0",
        cobuildTotalWithdrawn: "0",
        updatedAt: null,
        address: "0xstakevault",
      },
      accountState: {
        goal: {
          hasPosition: false,
          staked: "0",
          withdrawn: "0",
          netStaked: "0",
          updatedAt: null,
        },
        cobuild: {
          hasPosition: false,
          staked: "0",
          withdrawn: "0",
          netStaked: "0",
          updatedAt: null,
        },
      },
      juror: null,
    });
    expect(mocks.select).toHaveBeenCalledTimes(4);
  });

  it("returns null for unresolved non-address stake identifiers after a single goal lookup miss", async () => {
    queueSelectRows([]);

    await expect(
      inspectStakePosition(
        "missing-goal",
        "0x00000000000000000000000000000000000000Bb",
      ),
    ).resolves.toBeNull();
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("returns synthetic vault state when a goal resolves without a stake vault", async () => {
    queueSelectRows(
      [
        {
          id: "0xgoal-no-vault",
          goalRevnetId: "77",
          state: 0,
          finalized: false,
          canonicalRouteSlug: "beta",
          canonicalRouteDomain: null,
          stakeVault: null,
        },
      ],
      [],
    );

    await expect(
      inspectStakePosition("beta", "0x00000000000000000000000000000000000000Bb"),
    ).resolves.toEqual({
      identifier: "beta",
      account: "0x00000000000000000000000000000000000000bb",
      vaultAddress: null,
      goal: {
        goalAddress: "0xgoal-no-vault",
        goalRevnetId: "77",
        state: "Funding",
        stateCode: 0,
        finalized: false,
        route: {
          slug: "beta",
          domain: null,
        },
        stakeVault: null,
      },
      budget: null,
      vault: {
        kind: "goal",
        treasury: "0xgoal-no-vault",
        resolved: null,
        goalTotalStaked: "0",
        goalTotalWithdrawn: "0",
        cobuildTotalStaked: "0",
        cobuildTotalWithdrawn: "0",
        updatedAt: null,
        address: null,
      },
      accountState: {
        goal: {
          hasPosition: false,
          staked: "0",
          withdrawn: "0",
          netStaked: "0",
          updatedAt: null,
        },
        cobuild: {
          hasPosition: false,
          staked: "0",
          withdrawn: "0",
          netStaked: "0",
          updatedAt: null,
        },
      },
      juror: null,
    });
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("falls back to the goal stake vault for budget-derived stake lookups when context stakeVault is missing", async () => {
    queueSelectRows(
      [],
      [
        {
          id: "0x0000000000000000000000000000000000000abc",
          recipientId: "0xrecipient",
          childFlow: null,
          premiumEscrow: null,
          state: 1,
          finalized: false,
        },
      ],
      [
        {
          id: "0x0000000000000000000000000000000000000abc",
          goalTreasury: "0xgoal",
          stakeVault: null,
        },
      ],
      [
        {
          id: "0xgoal",
          goalRevnetId: "5",
          state: 1,
          finalized: false,
          canonicalRouteSlug: "zeta",
          canonicalRouteDomain: null,
          stakeVault: "0xvault",
        },
      ],
      [
        {
          id: "0xvault",
          kind: "goal",
          treasury: "0xgoal",
          resolved: false,
          goalTotalStaked: "10",
          goalTotalWithdrawn: "0",
          cobuildTotalStaked: "0",
          cobuildTotalWithdrawn: "0",
          updatedAtTimestamp: null,
        },
      ],
      [],
      [],
    );

    await expect(
      inspectStakePosition(
        "0x0000000000000000000000000000000000000AbC",
        "0x00000000000000000000000000000000000000Bb",
      ),
    ).resolves.toMatchObject({
      vaultAddress: "0xvault",
      goal: {
        goalAddress: "0xgoal",
        stakeVault: "0xvault",
      },
      vault: {
        address: "0xvault",
        treasury: "0xgoal",
      },
    });
    expect(mocks.select).toHaveBeenCalledTimes(7);
  });

  it("inspects stake positions through direct stake-vault lookup with populated account state", async () => {
    queueSelectRows(
      [],
      [],
      [],
      [
        {
          id: "0x0000000000000000000000000000000000000ddd",
          kind: "budget",
          treasury: "0xbudget",
          resolved: true,
          goalTotalStaked: "100",
          goalTotalWithdrawn: "10",
          cobuildTotalStaked: "50",
          cobuildTotalWithdrawn: "5",
          updatedAtTimestamp: "1715000000",
        },
      ],
      [
        {
          id: "0xbudget",
          recipientId: "0xrecipient",
          childFlow: "0xchild",
          premiumEscrow: "0xescrow",
          state: 3,
          finalized: true,
        },
      ],
      [
        {
          tokenKind: "goal",
          staked: "80",
          withdrawn: "30",
          updatedAtTimestamp: "1715000100",
        },
        {
          tokenKind: "cobuild",
          staked: "25",
          withdrawn: "5",
          updatedAtTimestamp: "1715000200",
        },
      ],
      [
        {
          optedIn: true,
          currentJurorWeight: "9",
          lockedGoalAmount: "12",
          exitTime: "1715000300",
          delegate: "0xdelegate",
          slasher: "0xslasher",
          slashedTotal: "2",
          updatedAtTimestamp: "1715000400",
        },
      ],
    );

    await expect(
      inspectStakePosition(
        "0x0000000000000000000000000000000000000DdD",
        "0x00000000000000000000000000000000000000Ee",
      ),
    ).resolves.toEqual({
      identifier: "0x0000000000000000000000000000000000000DdD",
      account: "0x00000000000000000000000000000000000000ee",
      vaultAddress: "0x0000000000000000000000000000000000000ddd",
      goal: null,
      budget: {
        budgetAddress: "0xbudget",
        recipientId: "0xrecipient",
        state: "Failed",
        stateCode: 3,
        finalized: true,
        childFlow: "0xchild",
        premiumEscrow: "0xescrow",
      },
      vault: {
        kind: "budget",
        treasury: "0xbudget",
        resolved: true,
        goalTotalStaked: "100",
        goalTotalWithdrawn: "10",
        cobuildTotalStaked: "50",
        cobuildTotalWithdrawn: "5",
        updatedAt: "2024-05-06T12:53:20.000Z",
        address: "0x0000000000000000000000000000000000000ddd",
      },
      accountState: {
        goal: {
          hasPosition: true,
          staked: "80",
          withdrawn: "30",
          netStaked: "50",
          updatedAt: "2024-05-06T12:55:00.000Z",
        },
        cobuild: {
          hasPosition: true,
          staked: "25",
          withdrawn: "5",
          netStaked: "20",
          updatedAt: "2024-05-06T12:56:40.000Z",
        },
      },
      juror: {
        optedIn: true,
        currentWeight: "9",
        lockedGoalAmount: "12",
        exitTime: "2024-05-06T12:58:20.000Z",
        delegate: "0xdelegate",
        slasher: "0xslasher",
        slashedTotal: "2",
        updatedAt: "2024-05-06T13:00:00.000Z",
      },
    });
    expect(mocks.select).toHaveBeenCalledTimes(7);
  });

  it("inspects premium escrow state with optional account detail", async () => {
    queueSelectRows(
      [
        {
          id: "0xstack",
          budgetTreasury: "0xbudget",
          premiumEscrow: "0xescrow",
          childFlow: "0xchild",
          status: "ACTIVE",
          strategy: "0xstrategy",
        },
      ],
      [
        {
          id: "0xbudget",
          recipientId: "0xstack",
          childFlow: "0xchild",
          premiumEscrow: "0xescrow",
          state: 1,
          finalized: false,
        },
      ],
      [
        {
          id: "0xescrow",
          budgetTreasury: "0xbudget",
          budgetStackId: "0xstack",
          childFlow: "0xchild",
          managerRewardPool: "0xpool",
          baselineReceived: "100",
          latestDistributedPremium: "12",
          latestTotalCoverage: "300",
          latestPremiumIndex: "8",
          closed: false,
          finalState: 1,
          activatedAt: "1714000000",
          closedAt: null,
          lastIndexedAtTimestamp: "1714000500",
          updatedAtTimestamp: "1714000600",
        },
      ],
      [
        {
          id: "0xbudget",
          goalTreasury: "0xgoal",
        },
      ],
      [
        {
          id: "0xgoal",
          goalRevnetId: "42",
          state: 1,
          finalized: false,
          canonicalRouteSlug: "alpha",
          canonicalRouteDomain: "alpha.cobuild.eth",
          stakeVault: "0xvault",
        },
      ],
      [
        {
          id: "0xescrow:0x00000000000000000000000000000000000000cc",
          currentCoverage: "25",
          claimableAmount: "3",
          exposureIntegral: "9",
          slashed: false,
          lastSlashWeight: "1",
          lastSlashDuration: "60",
          lastCheckpointTimestamp: "1714000400",
          updatedAtTimestamp: "1714000600",
        },
      ],
    );

    await expect(
      inspectPremiumEscrow("0xstack", "0x00000000000000000000000000000000000000Cc"),
    ).resolves.toEqual({
      identifier: "0xstack",
      escrowAddress: "0xescrow",
      goal: {
        goalAddress: "0xgoal",
        goalRevnetId: "42",
        state: "Active",
        stateCode: 1,
        finalized: false,
        route: {
          slug: "alpha",
          domain: "alpha.cobuild.eth",
        },
        stakeVault: "0xvault",
      },
      budget: {
        budgetAddress: "0xbudget",
        recipientId: "0xstack",
        state: "Active",
        stateCode: 1,
        finalized: false,
        childFlow: "0xchild",
        premiumEscrow: "0xescrow",
      },
      budgetStack: {
        id: "0xstack",
        status: "ACTIVE",
        childFlow: "0xchild",
        strategy: "0xstrategy",
        budgetAddress: "0xbudget",
      },
      state: {
        budgetTreasury: "0xbudget",
        childFlow: "0xchild",
        managerRewardPool: "0xpool",
        baselineReceived: "100",
        latestDistributedPremium: "12",
        latestTotalCoverage: "300",
        latestPremiumIndex: "8",
        closed: false,
        finalState: 1,
      },
      timing: {
        activatedAt: "2024-04-24T23:06:40.000Z",
        closedAt: null,
        lastIndexedAt: "2024-04-24T23:15:00.000Z",
        updatedAt: "2024-04-24T23:16:40.000Z",
      },
      account: {
        address: "0x00000000000000000000000000000000000000cc",
        hasAccountState: true,
        currentCoverage: "25",
        claimableAmount: "3",
        exposureIntegral: "9",
        slashed: false,
        lastSlashWeight: "1",
        lastSlashDuration: "60",
        lastCheckpointAt: "2024-04-24T23:13:20.000Z",
        updatedAt: "2024-04-24T23:16:40.000Z",
      },
    });
    expect(mocks.select).toHaveBeenCalledTimes(6);
  });

  it("inspects premium escrow directly by escrow id without stack or account detail", async () => {
    queueSelectRows(
      [],
      [
        {
          id: "0x0000000000000000000000000000000000000eee",
          budgetTreasury: "0xbudget",
          budgetStackId: null,
          childFlow: null,
          managerRewardPool: null,
          baselineReceived: "7",
          latestDistributedPremium: "1",
          latestTotalCoverage: "9",
          latestPremiumIndex: "2",
          closed: true,
          finalState: 4,
          activatedAt: null,
          closedAt: "1715000500",
          lastIndexedAtTimestamp: "1715000600",
          updatedAtTimestamp: "1715000700",
        },
      ],
      [
        {
          id: "0xbudget",
          recipientId: "0xrecipient",
          childFlow: null,
          premiumEscrow: "0x0000000000000000000000000000000000000eee",
          state: 4,
          finalized: true,
        },
      ],
      [],
    );

    await expect(
      inspectPremiumEscrow("0x0000000000000000000000000000000000000EeE"),
    ).resolves.toEqual({
      identifier: "0x0000000000000000000000000000000000000EeE",
      escrowAddress: "0x0000000000000000000000000000000000000eee",
      goal: null,
      budget: {
        budgetAddress: "0xbudget",
        recipientId: "0xrecipient",
        state: "Expired",
        stateCode: 4,
        finalized: true,
        childFlow: null,
        premiumEscrow: "0x0000000000000000000000000000000000000eee",
      },
      budgetStack: null,
      state: {
        budgetTreasury: "0xbudget",
        childFlow: null,
        managerRewardPool: null,
        baselineReceived: "7",
        latestDistributedPremium: "1",
        latestTotalCoverage: "9",
        latestPremiumIndex: "2",
        closed: true,
        finalState: 4,
      },
      timing: {
        activatedAt: null,
        closedAt: "2024-05-06T13:01:40.000Z",
        lastIndexedAt: "2024-05-06T13:03:20.000Z",
        updatedAt: "2024-05-06T13:05:00.000Z",
      },
      account: null,
    });
    expect(mocks.select).toHaveBeenCalledTimes(4);
  });

  it("inspects detached premium escrow state without linked budget or goal context", async () => {
    queueSelectRows(
      [],
      [
        {
          id: "0x0000000000000000000000000000000000000fff",
          budgetTreasury: null,
          budgetStackId: null,
          childFlow: null,
          managerRewardPool: null,
          baselineReceived: "5",
          latestDistributedPremium: "1",
          latestTotalCoverage: "8",
          latestPremiumIndex: "2",
          closed: false,
          finalState: 0,
          activatedAt: null,
          closedAt: null,
          lastIndexedAtTimestamp: null,
          updatedAtTimestamp: null,
        },
      ],
    );

    await expect(
      inspectPremiumEscrow("0x0000000000000000000000000000000000000FfF"),
    ).resolves.toEqual({
      identifier: "0x0000000000000000000000000000000000000FfF",
      escrowAddress: "0x0000000000000000000000000000000000000fff",
      goal: null,
      budget: null,
      budgetStack: null,
      state: {
        budgetTreasury: null,
        childFlow: null,
        managerRewardPool: null,
        baselineReceived: "5",
        latestDistributedPremium: "1",
        latestTotalCoverage: "8",
        latestPremiumIndex: "2",
        closed: false,
        finalState: 0,
      },
      timing: {
        activatedAt: null,
        closedAt: null,
        lastIndexedAt: null,
        updatedAt: null,
      },
      account: null,
    });
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it("inspects disputes through mechanism arbitrator context fallback", async () => {
    queueSelectRows(
      [
        {
          id: "0xarb:12",
          arbitrator: "0xarb",
          tcrAddress: null,
          tcrKind: "mechanism",
          itemId: null,
          requestIndex: null,
          disputeId: "12",
          currentRound: "0",
          jurorAddresses: [],
          budgetTreasury: null,
          goalTreasury: null,
          stakeVault: null,
          ruling: null,
          choices: null,
          arbitrationCost: null,
          extraData: null,
          creationBlock: null,
          votingStartTime: null,
          votingEndTime: null,
          revealPeriodEndTime: null,
          executedAt: null,
          updatedAtTimestamp: null,
        },
      ],
      [],
      [
        {
          goalTreasury: "0xgoal",
          budgetTreasury: "0xbudget",
          stakeVault: "0xvault",
          budgetTcr: "0xmechtcr",
        },
      ],
      [
        {
          id: "0xbudget",
          recipientId: "0xrecipient",
          childFlow: null,
          premiumEscrow: null,
          state: 1,
          finalized: false,
        },
      ],
      [
        {
          id: "0xgoal",
          goalRevnetId: "88",
          state: 2,
          finalized: true,
          canonicalRouteSlug: "mech-goal",
          canonicalRouteDomain: null,
          stakeVault: "0xvault",
        },
      ],
      [],
    );

    await expect(inspectDispute("0xArb:12")).resolves.toMatchObject({
      identifier: "0xArb:12",
      disputeId: "12",
      arbitrator: "0xarb",
      goal: {
        goalAddress: "0xgoal",
        goalRevnetId: "88",
        state: "Succeeded",
        stakeVault: "0xvault",
      },
      budget: {
        budgetAddress: "0xbudget",
        recipientId: "0xrecipient",
      },
      tcr: {
        address: null,
        kind: "mechanism",
        itemId: null,
      },
      request: null,
      juror: null,
    });
    expect(mocks.select).toHaveBeenCalledTimes(6);
  });

  it("returns sparse disputes when no linked goal, budget, or request context can be derived", async () => {
    queueSelectRows([
      {
        id: "0xarb:13",
        arbitrator: null,
        tcrAddress: null,
        tcrKind: null,
        itemId: null,
        requestIndex: null,
        disputeId: "13",
        currentRound: "0",
        jurorAddresses: [],
        budgetTreasury: null,
        goalTreasury: null,
        stakeVault: null,
        ruling: null,
        choices: null,
        arbitrationCost: null,
        extraData: null,
        creationBlock: null,
        votingStartTime: null,
        votingEndTime: null,
        revealPeriodEndTime: null,
        executedAt: null,
        updatedAtTimestamp: null,
      },
    ]);

    await expect(inspectDispute("0xArb:13")).resolves.toEqual({
      identifier: "0xArb:13",
      disputeId: "13",
      arbitrator: null,
      currentRound: "0",
      jurorCount: 0,
      ruling: null,
      choices: null,
      arbitrationCost: null,
      extraData: null,
      creationBlock: null,
      goal: null,
      budget: null,
      tcr: null,
      request: null,
      timing: {
        votingStartAt: null,
        votingEndAt: null,
        revealEndAt: null,
        executedAt: null,
        updatedAt: null,
      },
      juror: null,
    });
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
});
