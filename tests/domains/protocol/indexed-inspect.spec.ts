import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("../../../src/infra/db/cobuildDb", () => ({
  cobuildDb: {
    select: mocks.select,
  },
}));

import { inspectBudget, inspectGoal } from "../../../src/domains/protocol/indexed-inspect";

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
});
