import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "../../../src/tools/registry";

const mocks = vi.hoisted(() => ({
  getOrSetCachedResultWithLock: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  createTimeoutFetch: vi.fn(),
  getCobuildAiContextSnapshot: vi.fn(),
  getOpenAiTimeoutMs: vi.fn(),
  createPublicClient: vi.fn(),
  requestContextGet: vi.fn(),
}));

vi.mock("../../../src/config/env", () => ({
  getOpenAiTimeoutMs: mocks.getOpenAiTimeoutMs,
}));

vi.mock("../../../src/infra/cache/cacheResult", () => ({
  getOrSetCachedResultWithLock: mocks.getOrSetCachedResultWithLock,
}));

vi.mock("../../../src/infra/db/cobuildDb", () => ({
  cobuildDb: {
    select: mocks.select,
    execute: mocks.execute,
  },
  cobuildPrimaryDb: () => ({
    execute: mocks.execute,
  }),
}));

vi.mock("../../../src/infra/http/timeout", () => ({
  createTimeoutFetch: mocks.createTimeoutFetch,
}));

vi.mock("../../../src/infra/cobuild-ai-context", async () => {
  const actual = await vi.importActual<typeof import("../../../src/infra/cobuild-ai-context")>(
    "../../../src/infra/cobuild-ai-context",
  );
  return {
    ...actual,
    getCobuildAiContextSnapshot: mocks.getCobuildAiContextSnapshot,
  };
});

vi.mock("@fastify/request-context", () => ({
  requestContext: {
    get: (...args: unknown[]) => mocks.requestContextGet(...args),
  },
}));

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: mocks.createPublicClient,
  };
});

function makeSelectChain(rows: unknown[]) {
  const chain = {
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: (input: unknown[]) => unknown) => Promise.resolve(resolve(rows)),
  };
  return chain;
}

function queueSelectRows(...rowsQueue: unknown[][]) {
  let index = 0;
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => makeSelectChain(rowsQueue[index++] ?? []),
    }),
  }));
}

function embeddingPayload() {
  return {
    data: [
      {
        embedding: Array.from({ length: 256 }, (_, i) => i / 256),
      },
    ],
  };
}

describe("tool registry execution", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();

    mocks.getOpenAiTimeoutMs.mockReturnValue(1_000);
    mocks.requestContextGet.mockReturnValue(undefined);
    mocks.getOrSetCachedResultWithLock.mockImplementation(
      async (_key: string, _prefix: string, fetchFn: () => Promise<unknown>) => await fetchFn(),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("executes get-user exact match", async () => {
    queueSelectRows([
      {
        fid: 123,
        fname: "alice",
        verifiedAddresses: ["0xabc"],
      },
    ]);

    const result = await executeTool("get-user", { fname: "alice" });

    expect(result).toMatchObject({
      ok: true,
      name: "get-user",
      output: {
        fid: 123,
        fname: "alice",
        addresses: ["0xabc"],
      },
      cacheControl: "private, max-age=60",
    });
  });

  it("executes get-user fuzzy fallback when exact lookup misses", async () => {
    queueSelectRows(
      [],
      [
        {
          fid: 321,
          fname: "alice-builder",
        },
      ],
    );

    const result = await executeTool("get-user", { fname: "ali" });

    expect(result).toMatchObject({
      ok: true,
      output: {
        usedLikeQuery: true,
        users: [{ fid: 321, fname: "alice-builder" }],
      },
    });
  });

  it("returns empty get-user results without fuzzy fallback for very short misses", async () => {
    queueSelectRows([]);

    const result = await executeTool("get-user", { fname: "al" });

    expect(result).toMatchObject({
      ok: true,
      output: {
        usedLikeQuery: false,
        users: [],
      },
    });
  });

  it("normalizes get-user lookups to lowercase before exact matching", async () => {
    queueSelectRows([
      {
        fid: 123,
        fname: "alice",
        verifiedAddresses: ["0xabc"],
      },
    ]);

    const result = await executeTool("get-user", { fname: "ALICE" });

    expect(mocks.getOrSetCachedResultWithLock).toHaveBeenCalledWith(
      "alice",
      expect.any(String),
      expect.any(Function),
      expect.any(Number),
    );
    expect(result).toMatchObject({
      ok: true,
      name: "get-user",
      output: {
        fid: 123,
        fname: "alice",
        addresses: ["0xabc"],
      },
    });
  });

  it("executes get-cast and normalizes alias names", async () => {
    mocks.execute.mockResolvedValueOnce({
      rows: [
        {
          hashHex: "a".repeat(40),
          parentHashHex: "b".repeat(40),
          rootHashHex: "a".repeat(40),
          rootParentUrl: "https://farcaster.xyz/~/channel/cobuild",
          text: "hello world",
          castTimestamp: "2026-03-02T00:00:00.000Z",
          replyCount: 2,
          viewCount: 9,
          authorFid: 123,
          authorFname: "alice",
          authorDisplayName: "Alice",
          authorAvatarUrl: "https://example.com/a.png",
          authorNeynarScore: 0.8,
        },
      ],
    });

    const result = await executeTool("cli.get-cast", {
      identifier: `0x${"A".repeat(40)}`,
      type: "hash",
    });

    expect(result).toMatchObject({
      ok: true,
      name: "get-cast",
      output: {
        hash: `0x${"a".repeat(40)}`,
        parentHash: `0x${"b".repeat(40)}`,
        text: "hello world",
        authorUsername: "alice",
      },
    });
  });

  it("executes cast-preview with optional fields", async () => {
    const result = await executeTool("cast-preview", {
      text: "  hello  ",
      embeds: [{ url: "https://example.com/1.png" }],
      parent: "0xparent",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        text: "hello",
        embeds: [{ url: "https://example.com/1.png" }],
        parent: "0xparent",
      },
      cacheControl: "no-store",
    });
  });

  it("executes get-treasury-stats and handles success", async () => {
    mocks.getCobuildAiContextSnapshot.mockResolvedValue({
      data: { asOf: "2026-03-02T00:00:00.000Z" },
      error: null,
    });

    const result = await executeTool("get-treasury-stats", {});

    expect(result).toMatchObject({
      ok: true,
      output: { asOf: "2026-03-02T00:00:00.000Z" },
      cacheControl: "public, max-age=60",
    });
  });

  it("executes get-wallet-balances with short-term cache", async () => {
    const getBalance = vi.fn().mockResolvedValue(1_250_000_000_000_000_000n);
    const readContract = vi.fn().mockResolvedValue(2_500_000n);
    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x00000000000000000000000000000000000000aA",
      agentKey: "default",
      scopes: ["tools:read"],
    });
    mocks.createPublicClient.mockReturnValue({
      getBalance,
      readContract,
    });

    const result = await executeTool("get-wallet-balances", { network: "base" });

    expect(result).toEqual({
      ok: true,
      name: "get-wallet-balances",
      output: {
        agentKey: "default",
        network: "base",
        walletAddress: "0x00000000000000000000000000000000000000aa",
        balances: {
          eth: {
            wei: "1250000000000000000",
            formatted: "1.25",
          },
          usdc: {
            raw: "2500000",
            decimals: 6,
            formatted: "2.5",
            contract: "0x833589fCD6EDB6E08F4C7C32D4F71B54BDA02913",
          },
        },
      },
      cacheControl: "private, max-age=60",
    });
    expect(mocks.getOrSetCachedResultWithLock).toHaveBeenCalledWith(
      "base:0x00000000000000000000000000000000000000aa",
      "cli-tools:get-wallet-balances:",
      expect.any(Function),
      30,
    );
    expect(getBalance).toHaveBeenCalledWith({
      address: "0x00000000000000000000000000000000000000aa",
    });
    expect(readContract).toHaveBeenCalledWith({
      address: "0x833589fCD6EDB6E08F4C7C32D4F71B54BDA02913",
      abi: expect.any(Array),
      functionName: "balanceOf",
      args: ["0x00000000000000000000000000000000000000aa"],
    });
  });

  it("executes get-goal from indexed scaffold tables", async () => {
    queueSelectRows(
      [
        {
          id: "0xgoal",
          owner: "0xowner",
          flowAddress: "0xflow",
          budgetStakeLedger: "0xstakeledger",
          goalToken: "0xgoaltoken",
          cobuildToken: "0xcobuildtoken",
          stakeVault: "0xstakevault",
          hook: "0xhook",
          successResolver: "0xresolver",
          goalRevnetId: "42",
          canonicalProjectChainId: 8453,
          canonicalProjectId: 77,
          canonicalRouteSlug: "alpha",
          canonicalRouteDomain: "alpha.cobuild.eth",
          minRaiseDeadline: "1710000000",
          deadline: "1711000000",
          minRaise: "1000000",
          strategy: "0xstrategy",
          parentFlow: "0xparentflow",
          state: 1,
          finalized: false,
          successAssertionRegisteredAt: "1710500000",
          reassertGraceDeadline: "1710600000",
          jurorSlasher: "0xjurorslasher",
          underwriterSlasher: "0xunderwriterslasher",
          successAt: "1710700000",
          lastSyncedTargetRate: "12",
          lastSyncedAppliedRate: "10",
          lastSyncedTreasuryBalance: "900",
          lastSyncedTimeRemaining: "86400",
          lastResidualFinalState: 2,
          lastResidualSettledAmount: "30",
          lastResidualControllerBurnAmount: "7",
          createdAtTimestamp: "1709000000",
          updatedAtTimestamp: "1710800000",
        },
      ],
      [
        {
          goalTreasury: "0xgoal",
          budgetTcr: "0xbudgettcr",
          arbitrator: "0xarbitrator",
          txHash: "0xtx",
        },
      ],
      [
        { id: "0xbudget1", goalTreasury: "0xgoal" },
        { id: "0xbudget2", goalTreasury: "0xgoal" },
      ],
      [
        {
          id: "0xrecipient1",
          flowId: "0xflow",
          budgetTreasury: "0xbudget1",
          recipient: "0xteam1",
          recipientIndex: 1,
          title: "Ops",
          tagline: "Keep the lights on",
          isRemoved: false,
        },
        {
          id: "0xrecipient2",
          flowId: "0xflow",
          budgetTreasury: "0xbudget2",
          recipient: "0xteam2",
          recipientIndex: 2,
          title: "Growth",
          tagline: "Find demand",
          isRemoved: true,
        },
      ],
      [
        {
          id: "0xstakevault",
          resolved: false,
          goalTotalStaked: "500",
          goalTotalWithdrawn: "25",
          cobuildTotalStaked: "800",
          cobuildTotalWithdrawn: "50",
        },
      ],
      [
        {
          id: "0xbudget1",
          recipientId: "0xrecipientid1",
          childFlow: "0xchild1",
          premiumEscrow: "0xpremium1",
          state: 1,
          finalized: false,
        },
        {
          id: "0xbudget2",
          recipientId: "0xrecipientid2",
          childFlow: "0xchild2",
          premiumEscrow: null,
          state: 4,
          finalized: true,
        },
      ],
    );

    const result = await executeTool("get-goal", { identifier: "alpha.cobuild.eth" });

    expect(result).toEqual({
      ok: true,
      name: "get-goal",
      output: {
        identifier: "alpha.cobuild.eth",
        goalAddress: "0xgoal",
        goalRevnetId: "42",
        state: "Active",
        stateCode: 1,
        finalized: false,
        project: {
          chainId: 8453,
          projectId: 77,
        },
        route: {
          slug: "alpha",
          domain: "alpha.cobuild.eth",
        },
        flow: {
          address: "0xflow",
          parentFlow: "0xparentflow",
          recipientCount: 2,
          activeRecipientCount: 1,
          budgetRecipientCount: 2,
        },
        stakeVault: {
          address: "0xstakevault",
          resolved: false,
          goalTotalStaked: "500",
          goalTotalWithdrawn: "25",
          cobuildTotalStaked: "800",
          cobuildTotalWithdrawn: "50",
        },
        budgetTcr: "0xbudgettcr",
        treasury: {
          owner: "0xowner",
          minRaise: "1000000",
          minRaiseDeadline: "2024-03-09T16:00:00.000Z",
          deadline: "2024-03-21T05:46:40.000Z",
          successAt: "2024-03-17T18:26:40.000Z",
          lastSyncedTargetRate: "12",
          lastSyncedAppliedRate: "10",
          lastSyncedTreasuryBalance: "900",
          lastSyncedTimeRemaining: "86400",
          lastResidualFinalState: 2,
          lastResidualSettledAmount: "30",
          lastResidualControllerBurnAmount: "7",
          createdAt: "2024-02-27T02:13:20.000Z",
          updatedAt: "2024-03-18T22:13:20.000Z",
        },
        governance: {
          arbitrator: "0xarbitrator",
          deploymentTxHash: "0xtx",
        },
        timing: {
          minRaiseDeadline: "2024-03-09T16:00:00.000Z",
          deadline: "2024-03-21T05:46:40.000Z",
          reassertGraceDeadline: "2024-03-16T14:40:00.000Z",
          successAt: "2024-03-17T18:26:40.000Z",
          successAssertionRegisteredAt: "2024-03-15T10:53:20.000Z",
          createdAt: "2024-02-27T02:13:20.000Z",
          updatedAt: "2024-03-18T22:13:20.000Z",
        },
        budgets: {
          total: 2,
          finalized: 1,
          byState: {
            Funding: 0,
            Active: 1,
            Succeeded: 0,
            Failed: 0,
            Expired: 1,
          },
          items: [
            {
              budgetAddress: "0xbudget1",
              recipientId: "0xrecipientid1",
              state: "Active",
              stateCode: 1,
              finalized: false,
              childFlow: "0xchild1",
              premiumEscrow: "0xpremium1",
              recipient: {
                address: "0xteam1",
                recipientIndex: 1,
                title: "Ops",
                tagline: "Keep the lights on",
                isRemoved: false,
              },
            },
            {
              budgetAddress: "0xbudget2",
              recipientId: "0xrecipientid2",
              state: "Expired",
              stateCode: 4,
              finalized: true,
              childFlow: "0xchild2",
              premiumEscrow: null,
              recipient: {
                address: "0xteam2",
                recipientIndex: 2,
                title: "Growth",
                tagline: "Find demand",
                isRemoved: true,
              },
            },
          ],
        },
      },
      cacheControl: "private, max-age=60",
    });
  });

  it("executes get-budget from indexed scaffold tables", async () => {
    queueSelectRows(
      [
        {
          id: "0xbudget1",
          controller: "0xcontroller",
          recipientId: "0xrecipientid1",
          childFlow: "0xchild1",
          premiumEscrow: "0xpremium1",
          fundingDeadline: "1712000000",
          executionDuration: "604800",
          activationThreshold: "250",
          runwayCap: "1200",
          state: 2,
          finalized: false,
          successAssertionRegisteredAt: "1712100000",
          successResolutionDisabled: false,
          reassertGraceDeadline: "1712200000",
          lastSyncedTargetRate: "18",
          lastSyncedAppliedRate: "16",
          lastSyncedTreasuryBalance: "550",
          lastSyncedTimeRemaining: "7200",
          lastResidualDestination: "0xgoal",
          lastResidualSettledAmount: "12",
          createdAtTimestamp: "1711800000",
          updatedAtTimestamp: "1712300000",
        },
      ],
      [
        {
          id: "0xbudget1",
          goalTreasury: "0xgoal",
        },
      ],
      [
        {
          id: "0xrecipient1",
          budgetTreasury: "0xbudget1",
          recipient: "0xteam1",
          recipientIndex: 1,
          title: "Ops",
          tagline: "Keep the lights on",
          isRemoved: false,
        },
      ],
      [
        {
          id: "0xpremium1",
          baselineReceived: "100",
          latestDistributedPremium: "12",
          latestTotalCoverage: "300",
          latestPremiumIndex: "8",
          closed: false,
          finalState: 1,
          activatedAt: "1712150000",
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
          goalTreasury: "0xgoal",
          budgetTcr: "0xbudgettcr",
          arbitrator: "0xarbitrator",
        },
      ],
    );

    const result = await executeTool("get-budget", { identifier: "0xrecipientid1" });

    expect(result).toEqual({
      ok: true,
      name: "get-budget",
      output: {
        identifier: "0xrecipientid1",
        budgetAddress: "0xbudget1",
        recipientId: "0xrecipientid1",
        goalAddress: "0xgoal",
        budgetTcr: "0xbudgettcr",
        state: "Succeeded",
        stateCode: 2,
        finalized: false,
        treasury: {
          controller: "0xcontroller",
          activationThreshold: "250",
          runwayCap: "1200",
          fundingDeadline: "2024-04-01T19:33:20.000Z",
          executionDurationSeconds: "604800",
          successResolutionDisabled: false,
          lastSyncedTargetRate: "18",
          lastSyncedAppliedRate: "16",
          lastSyncedTreasuryBalance: "550",
          lastSyncedTimeRemaining: "7200",
          lastResidualDestination: "0xgoal",
          lastResidualSettledAmount: "12",
          createdAt: "2024-03-30T12:00:00.000Z",
          updatedAt: "2024-04-05T06:53:20.000Z",
        },
        flow: {
          childFlow: "0xchild1",
          recipientAddress: "0xteam1",
          recipientIndex: 1,
          title: "Ops",
          tagline: "Keep the lights on",
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
            address: "0xpremium1",
            baselineReceived: "100",
            latestDistributedPremium: "12",
            latestTotalCoverage: "300",
            latestPremiumIndex: "8",
            closed: false,
            finalState: 1,
            activatedAt: "2024-04-03T13:13:20.000Z",
            closedAt: null,
          },
        },
        timing: {
          fundingDeadline: "2024-04-01T19:33:20.000Z",
          reassertGraceDeadline: "2024-04-04T03:06:40.000Z",
          successAssertionRegisteredAt: "2024-04-02T23:20:00.000Z",
          createdAt: "2024-03-30T12:00:00.000Z",
          updatedAt: "2024-04-05T06:53:20.000Z",
        },
      },
      cacheControl: "private, max-age=60",
    });
  });

  it("executes get-tcr-request from indexed scaffold tables", async () => {
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

    const result = await executeTool("get-tcr-request", { identifier: "0xTcr:0xItem:2" });

    expect(result).toEqual({
      ok: true,
      name: "get-tcr-request",
      output: {
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
      },
      cacheControl: "private, max-age=60",
    });
  });

  it("executes get-dispute from indexed scaffold tables", async () => {
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

    const result = await executeTool("get-dispute", {
      identifier: "0xArbitrator:7",
      juror: "0x00000000000000000000000000000000000000Aa",
    });

    expect(result).toEqual({
      ok: true,
      name: "get-dispute",
      output: {
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
      },
      cacheControl: "private, max-age=60",
    });
  });

  it("executes get-stake-position and returns zeroed account state when stake rows are absent", async () => {
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

    const result = await executeTool("get-stake-position", {
      identifier: "0x00000000000000000000000000000000000000Aa",
      account: "0x00000000000000000000000000000000000000Bb",
    });

    expect(result).toEqual({
      ok: true,
      name: "get-stake-position",
      output: {
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
      },
      cacheControl: "private, max-age=60",
    });
  });

  it("executes get-premium-escrow with optional account state", async () => {
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

    const result = await executeTool("get-premium-escrow", {
      identifier: "0xstack",
      account: "0x00000000000000000000000000000000000000Cc",
    });

    expect(result).toEqual({
      ok: true,
      name: "get-premium-escrow",
      output: {
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
      },
      cacheControl: "private, max-age=60",
    });
  });

  it("returns 404 for missing indexed protocol inspect rows", async () => {
    queueSelectRows([], []);

    expect(await executeTool("get-goal", { identifier: "missing-goal" })).toEqual({
      ok: false,
      name: "get-goal",
      statusCode: 404,
      error: "Goal not found.",
    });

    expect(await executeTool("get-budget", { identifier: "0xdeadbeef" })).toEqual({
      ok: false,
      name: "get-budget",
      statusCode: 404,
      error: "Budget not found.",
    });

    queueSelectRows([]);
    expect(await executeTool("get-tcr-request", { identifier: "0xtcr:0xitem:1" })).toEqual({
      ok: false,
      name: "get-tcr-request",
      statusCode: 404,
      error: "TCR request not found.",
    });

    queueSelectRows([]);
    expect(await executeTool("get-dispute", { identifier: "0xarbitrator:1" })).toEqual({
      ok: false,
      name: "get-dispute",
      statusCode: 404,
      error: "Dispute not found.",
    });

    queueSelectRows([]);
    expect(
      await executeTool("get-stake-position", {
        identifier: "missing-goal",
        account: "0x00000000000000000000000000000000000000aa",
      }),
    ).toEqual({
      ok: false,
      name: "get-stake-position",
      statusCode: 404,
      error: "Stake position not found.",
    });

    queueSelectRows([], []);
    expect(await executeTool("get-premium-escrow", { identifier: "0xstack" })).toEqual({
      ok: false,
      name: "get-premium-escrow",
      statusCode: 404,
      error: "Premium escrow not found.",
    });
  });

  it("validates indexed protocol inspect identifiers before hitting the database", async () => {
    expect(await executeTool("get-goal", {})).toEqual({
      ok: false,
      name: "get-goal",
      statusCode: 400,
      error: "identifier must be a string.",
    });

    expect(await executeTool("get-goal", { identifier: "   " })).toEqual({
      ok: false,
      name: "get-goal",
      statusCode: 400,
      error: "identifier must not be empty.",
    });

    expect(await executeTool("get-budget", {})).toEqual({
      ok: false,
      name: "get-budget",
      statusCode: 400,
      error: "identifier must be a string.",
    });

    expect(await executeTool("get-budget", { identifier: "   " })).toEqual({
      ok: false,
      name: "get-budget",
      statusCode: 400,
      error: "identifier must not be empty.",
    });

    expect(await executeTool("get-tcr-request", {})).toEqual({
      ok: false,
      name: "get-tcr-request",
      statusCode: 400,
      error: "identifier must be a string.",
    });

    expect(await executeTool("get-dispute", { identifier: "   " })).toEqual({
      ok: false,
      name: "get-dispute",
      statusCode: 400,
      error: "identifier must not be empty.",
    });

    expect(await executeTool("get-dispute", { identifier: "0xarbitrator:1", juror: "bad" })).toEqual({
      ok: false,
      name: "get-dispute",
      statusCode: 400,
      error: "juror must be a valid EVM address.",
    });

    expect(await executeTool("get-stake-position", { identifier: "alpha" })).toEqual({
      ok: false,
      name: "get-stake-position",
      statusCode: 400,
      error: "account must be a string.",
    });

    expect(
      await executeTool("get-stake-position", { identifier: "alpha", account: "bad" }),
    ).toEqual({
      ok: false,
      name: "get-stake-position",
      statusCode: 400,
      error: "account must be a valid EVM address.",
    });

    expect(
      await executeTool("get-premium-escrow", { identifier: "0xstack", account: "bad" }),
    ).toEqual({
      ok: false,
      name: "get-premium-escrow",
      statusCode: 400,
      error: "account must be a valid EVM address.",
    });
  });

  it("returns 502 when indexed protocol inspect queries throw", async () => {
    mocks.select.mockImplementation(() => ({
      from: () => ({
        where: () => {
          throw new Error("db unavailable");
        },
      }),
    }));

    await expect(executeTool("get-goal", { identifier: "alpha" })).resolves.toEqual({
      ok: false,
      name: "get-goal",
      statusCode: 502,
      error: "get-goal request failed: db unavailable",
    });

    await expect(executeTool("get-budget", { identifier: "0xrecipientid1" })).resolves.toEqual({
      ok: false,
      name: "get-budget",
      statusCode: 502,
      error: "get-budget request failed: db unavailable",
    });

    await expect(executeTool("get-tcr-request", { identifier: "0xtcr:0xitem:1" })).resolves.toEqual({
      ok: false,
      name: "get-tcr-request",
      statusCode: 502,
      error: "get-tcr-request request failed: db unavailable",
    });

    await expect(executeTool("get-dispute", { identifier: "0xarbitrator:1" })).resolves.toEqual({
      ok: false,
      name: "get-dispute",
      statusCode: 502,
      error: "get-dispute request failed: db unavailable",
    });

    await expect(
      executeTool("get-stake-position", {
        identifier: "alpha",
        account: "0x00000000000000000000000000000000000000aa",
      }),
    ).resolves.toEqual({
      ok: false,
      name: "get-stake-position",
      statusCode: 502,
      error: "get-stake-position request failed: db unavailable",
    });

    await expect(executeTool("get-premium-escrow", { identifier: "0xstack" })).resolves.toEqual({
      ok: false,
      name: "get-premium-escrow",
      statusCode: 502,
      error: "get-premium-escrow request failed: db unavailable",
    });
  });

  it("executes list-wallet-notifications with cursor pagination and unread state", async () => {
    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x00000000000000000000000000000000000000aA",
      agentKey: "default",
      scopes: ["tools:read", "notifications:read"],
    });
    mocks.execute
      .mockResolvedValueOnce({
        rows: [{ count: "2", watermark: "1741435200000001" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "11",
            kind: "discussion",
            reason: "mention",
            eventAt: "2026-03-08T12:00:00.123456Z",
            eventAtCursor: "2026-03-08T12:00:00.123456Z",
            createdAt: "2026-03-08T12:00:03.654321Z",
            createdAtCursor: "2026-03-08T12:00:03.654321Z",
            isUnread: true,
            sourceType: "farcaster_cast",
            sourceId: "0xabc123",
            sourceHashHex: "a".repeat(40),
            rootHashHex: "b".repeat(40),
            targetHashHex: "c".repeat(40),
            actorFid: 99,
            actorWalletAddress: null,
            actorUsername: "alice",
            actorDisplayName: "Alice",
            actorAvatarUrl: "https://example.com/a.png",
            sourceText: "Alice mentioned you in a reply",
            rootText: "Root post title",
            payload: { foo: "bar" },
          },
          {
            id: "10",
            kind: "payment",
            reason: "received",
            eventAt: null,
            eventAtCursor: null,
            createdAt: "2026-03-08T11:00:01.000001Z",
            createdAtCursor: "2026-03-08T11:00:01.000001Z",
            isUnread: false,
            sourceType: "payment",
            sourceId: "payment_1",
            sourceHashHex: null,
            rootHashHex: null,
            targetHashHex: null,
            actorFid: null,
            actorWalletAddress: "0x0000000000000000000000000000000000000002",
            actorUsername: null,
            actorDisplayName: null,
            actorAvatarUrl: null,
            sourceText: null,
            rootText: null,
            payload: { amount: "5" },
          },
        ],
      });

    const result = await executeTool("list-wallet-notifications", {
      limit: 1,
      unreadOnly: true,
      kinds: ["discussion", "payment"],
    });

    expect(result).toEqual({
      ok: true,
      name: "list-wallet-notifications",
      output: {
        subjectWalletAddress: "0x00000000000000000000000000000000000000aa",
        items: [
          {
            id: "11",
            kind: "discussion",
            reason: "mention",
            eventAt: "2026-03-08T12:00:00.123456Z",
            createdAt: "2026-03-08T12:00:03.654321Z",
            isUnread: true,
            actor: {
              fid: 99,
              walletAddress: null,
              name: "Alice",
              username: "alice",
              avatarUrl: "https://example.com/a.png",
            },
            summary: {
              title: "Root post title",
              excerpt: "Alice mentioned you in a reply",
            },
            resource: {
              sourceType: "farcaster_cast",
              sourceId: "0xabc123",
              sourceHash: `0x${"a".repeat(40)}`,
              rootHash: `0x${"b".repeat(40)}`,
              targetHash: `0x${"c".repeat(40)}`,
              appPath: `/cast/0x${"b".repeat(40)}?post=0x${"a".repeat(40)}`,
            },
            payload: { foo: "bar" },
          },
        ],
        pageInfo: {
          limit: 1,
          nextCursor: expect.any(String),
          hasMore: true,
        },
        unread: {
          count: 2,
          watermark: "1741435200000001",
        },
      },
      cacheControl: "no-store",
    });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it("returns request-scoped agentKey even when wallet balances are cached", async () => {
    const getBalance = vi.fn().mockResolvedValue(1_250_000_000_000_000_000n);
    const readContract = vi.fn().mockResolvedValue(2_500_000n);
    const cache = new Map<string, unknown>();
    mocks.createPublicClient.mockReturnValue({
      getBalance,
      readContract,
    });
    mocks.getOrSetCachedResultWithLock.mockImplementation(
      async (key: string, prefix: string, fetchFn: () => Promise<unknown>) => {
        const cacheKey = `${prefix}${key}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey);
        const value = await fetchFn();
        cache.set(cacheKey, value);
        return value;
      },
    );

    mocks.requestContextGet
      .mockReturnValueOnce({
        ownerAddress: "0x00000000000000000000000000000000000000aA",
        agentKey: "default",
        scopes: ["tools:read"],
      })
      .mockReturnValueOnce({
        ownerAddress: "0x00000000000000000000000000000000000000aA",
        agentKey: "default",
        scopes: ["tools:read"],
      })
      .mockReturnValueOnce({
        ownerAddress: "0x00000000000000000000000000000000000000aA",
        agentKey: "ops",
        scopes: ["tools:read"],
      })
      .mockReturnValueOnce({
        ownerAddress: "0x00000000000000000000000000000000000000aA",
        agentKey: "ops",
        scopes: ["tools:read"],
      });

    const first = await executeTool("get-wallet-balances", { network: "base" });
    const second = await executeTool("get-wallet-balances", { network: "base" });

    expect(first).toMatchObject({
      ok: true,
      name: "get-wallet-balances",
      output: {
        agentKey: "default",
      },
    });
    expect(second).toMatchObject({
      ok: true,
      name: "get-wallet-balances",
      output: {
        agentKey: "ops",
      },
    });
    expect(getBalance).toHaveBeenCalledTimes(1);
    expect(readContract).toHaveBeenCalledTimes(1);
  });

  it("executes docs-search and parses results from both payload formats", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.DOCS_VECTOR_STORE_ID = "vs_123";

    const timeoutFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                file_id: "file_data_1",
                filename: "data.md",
                score: 0.81,
                text: "From data array",
                attributes: {
                  slug: "/docs/data",
                  path: "docs/data",
                },
              },
              {
                file_id: "file_data_2",
                filename: "empty-snippet.md",
                score: 0.5,
                content: [{}],
                attributes: {
                  path: "docs/empty",
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: [
              {
                type: "file_search_call",
                results: [
                  {
                    file_id: "file_output_1",
                    filename: "output.md",
                    score: 0.93,
                    content: [{ text: "From output results" }],
                    attributes: {
                      slug: "docs/output",
                      path: "docs/output",
                    },
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      );
    mocks.createTimeoutFetch.mockReturnValue(timeoutFetch);

    const first = await executeTool("docs-search", { query: "bridge", limit: 2 });
    const second = await executeTool("docs.search", { query: "governance", limit: 2 });

    expect(first).toMatchObject({
      ok: true,
      name: "docs-search",
      output: {
        query: "bridge",
        count: 2,
        results: [
          {
            fileId: "file_data_1",
            filename: "data.md",
            url: "https://docs.co.build/docs/data",
            snippet: "From data array",
          },
          {
            fileId: "file_data_2",
            filename: "empty-snippet.md",
            url: null,
            snippet: null,
          },
        ],
      },
    });
    expect(second).toMatchObject({
      ok: true,
      name: "docs-search",
      output: {
        query: "governance",
        count: 1,
        results: [
          {
            fileId: "file_output_1",
            filename: "output.md",
            url: "https://docs.co.build/docs/output",
            snippet: "From output results",
          },
        ],
      },
    });
  });

  it("executes list-discussions with sorting and pagination", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        {
          hashHex: "1".repeat(40),
          text: "hello world from top-level post",
          castTimestamp: "2026-03-01T00:00:00.000Z",
          replyCount: "2",
          viewCount: "11",
          lastReplyTimestamp: "2026-03-01T01:00:00.000Z",
          lastReplyAuthorFname: "bob",
          authorFid: 123,
          authorFname: "alice",
          authorDisplayName: "Alice",
          authorAvatarUrl: "https://example.com/pfp.png",
          authorNeynarScore: 0.8,
        },
        {
          hashHex: "2".repeat(40),
          text: "second row to trigger hasMore",
          castTimestamp: "2026-03-01T00:30:00.000Z",
          replyCount: "1",
          viewCount: "4",
          lastReplyTimestamp: null,
          lastReplyAuthorFname: null,
          authorFid: 222,
          authorFname: "carol",
          authorDisplayName: "Carol",
          authorAvatarUrl: null,
          authorNeynarScore: 0.7,
        },
      ],
    });

    const result = await executeTool("list-discussions", {
      limit: 1,
      offset: 0,
      sort: "views",
      direction: "asc",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        hasMore: true,
        limit: 1,
        offset: 0,
        sort: "views",
        direction: "asc",
        items: [
          {
            hash: `0x${"1".repeat(40)}`,
            title: "hello world from top-level post",
            authorUsername: "alice",
            replyCount: 2,
            viewCount: 11,
            author: {
              fid: 123,
              username: "alice",
            },
          },
        ],
      },
    });
  });

  it("maps list-discussions rows without last reply metadata", async () => {
    mocks.execute.mockResolvedValueOnce({
      rows: [
        {
          hashHex: "2".repeat(40),
          text: "post without replies",
          castTimestamp: "2026-03-01T00:00:00.000Z",
          replyCount: "0",
          viewCount: "5",
          lastReplyTimestamp: null,
          lastReplyAuthorFname: null,
          authorFid: 123,
          authorFname: "alice",
          authorDisplayName: "Alice",
          authorAvatarUrl: null,
          authorNeynarScore: 0.91,
        },
      ],
    });

    const result = await executeTool("list-discussions", {});

    expect(result).toMatchObject({
      ok: true,
      output: {
        items: [
          {
            hash: `0x${"2".repeat(40)}`,
            lastReply: null,
          },
        ],
      },
    });
  });

  it("executes list-discussions with replies sort branch", async () => {
    mocks.execute.mockResolvedValueOnce({
      rows: [],
    });

    const result = await executeTool("list-discussions", {
      sort: "replies",
      direction: "desc",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        sort: "replies",
        direction: "desc",
      },
    });
  });

  it("executes get-discussion-thread with focus pagination", async () => {
    const rootHash = `0x${"3".repeat(40)}`;
    const focusHash = `0x${"8".repeat(40)}`;
    mocks.execute
      .mockResolvedValueOnce({
        rows: [
          {
            hashHex: "3".repeat(40),
            parentHashHex: null,
            text: "root post",
            castTimestamp: "2026-03-01T00:00:00.000Z",
            viewCount: "10",
            authorFid: 1,
            authorFname: "rooter",
            authorDisplayName: "Root",
            authorAvatarUrl: null,
            authorNeynarScore: 0.9,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ count: "3" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            focusTimestamp: "2026-03-01T02:00:00.000Z",
            focusHashHex: "8".repeat(40),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ count: "2" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            hashHex: "8".repeat(40),
            parentHashHex: "3".repeat(40),
            text: "focused reply",
            castTimestamp: "2026-03-01T02:00:00.000Z",
            viewCount: "1",
            authorFid: 4,
            authorFname: "dave",
            authorDisplayName: "Dave",
            authorAvatarUrl: null,
            authorNeynarScore: 0.8,
          },
        ],
      });

    const result = await executeTool("get-discussion-thread", {
      rootHash,
      page: 1,
      pageSize: 2,
      focusHash,
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        root: {
          hash: rootHash,
          text: "root post",
          authorUsername: "rooter",
        },
        page: 2,
        pageSize: 2,
        totalPages: 2,
        hasNextPage: false,
        hasPrevPage: true,
        focusHash,
        replies: [
          {
            hash: focusHash,
            parentHash: rootHash,
            text: "focused reply",
            authorUsername: "dave",
          },
        ],
      },
    });
  });

  it("executes semantic-search-casts and maps embedding/vector results", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const rootHash = `0x${"a".repeat(40)}`;
    const timeoutFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(embeddingPayload()), {
          status: 200,
        }),
      );
    mocks.createTimeoutFetch.mockReturnValue(timeoutFetch);
    mocks.execute.mockResolvedValue({
      rows: [
        {
          hashHex: "b".repeat(40),
          parentHashHex: "a".repeat(40),
          rootHashHex: "a".repeat(40),
          text: "semantic result",
          castTimestamp: "2026-03-01T03:00:00.000Z",
          distance: 0.2,
          authorFid: 101,
          authorFname: "eve",
          authorDisplayName: "Eve",
          authorAvatarUrl: null,
          authorNeynarScore: 0.78,
        },
      ],
    });

    const result = await executeTool("semantic-search-casts", {
      query: "build ecosystem",
      limit: 5,
      rootHash,
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        query: "build ecosystem",
        count: 1,
        rootHash,
        items: [
          {
            hash: `0x${"b".repeat(40)}`,
            parentHash: rootHash,
            rootHash,
            authorUsername: "eve",
            similarity: 0.8,
          },
        ],
      },
      cacheControl: "private, max-age=60",
    });
  });

  it("returns a 400 when tool name is empty after trim", async () => {
    const result = await executeTool("   ", {});
    expect(result).toEqual({
      ok: false,
      name: "",
      statusCode: 400,
      error: "Tool name must not be empty.",
    });
  });

  it("covers get-user validation and failure branches", async () => {
    const missing = await executeTool("get-user", {});
    expect(missing).toEqual({
      ok: false,
      name: "get-user",
      statusCode: 400,
      error: "fname must be a string.",
    });

    const blank = await executeTool("get-user", { fname: "   " });
    expect(blank).toEqual({
      ok: false,
      name: "get-user",
      statusCode: 400,
      error: "fname must not be empty.",
    });

    mocks.getOrSetCachedResultWithLock.mockRejectedValueOnce(new Error("db down"));
    const failure = await executeTool("get-user", { fname: "alice" });
    expect(failure).toEqual({
      ok: false,
      name: "get-user",
      statusCode: 502,
      error: "get-user request failed: db down",
    });
  });

  it("covers get-cast validation and upstream failure branches", async () => {
    process.env.ENABLE_CLI_GET_CAST = "false";
    expect(await executeTool("get-cast", { identifier: "x", type: "hash" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 403,
      error: "This tool is disabled.",
    });
    delete process.env.ENABLE_CLI_GET_CAST;

    expect(await executeTool("get-cast", {})).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 400,
      error: "identifier must be a string.",
    });

    expect(await executeTool("get-cast", { identifier: "   ", type: "hash" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 400,
      error: "identifier must not be empty.",
    });

    expect(await executeTool("get-cast", { identifier: "x", type: "nope" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 400,
      error: 'type must be either "hash" or "url".',
    });

    expect(await executeTool("get-cast", { identifier: "https://warpcast.com/alice/0xabc", type: "url" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 400,
      error: "URL lookup is no longer supported. Provide a full cast hash (0x + 40 hex chars).",
    });

    expect(await executeTool("get-cast", { identifier: "x", type: "hash" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 400,
      error: "identifier must be a full cast hash (0x + 40 hex chars).",
    });

    const missingHash = `0x${"1".repeat(40)}`;
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    expect(await executeTool("get-cast", { identifier: missingHash, type: "hash" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 404,
      error: "Cast not found.",
    });

    mocks.execute.mockRejectedValueOnce(new Error("db fail"));
    expect(await executeTool("get-cast", { identifier: missingHash, type: "hash" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 502,
      error: "get-cast request failed: db fail",
    });
  });

  it("covers cast-preview validation branches", async () => {
    expect(await executeTool("cast-preview", {})).toEqual({
      ok: false,
      name: "cast-preview",
      statusCode: 400,
      error: "text must be a string.",
    });

    expect(await executeTool("cast-preview", { text: "   " })).toEqual({
      ok: false,
      name: "cast-preview",
      statusCode: 400,
      error: "text must not be empty.",
    });
  });

  it("covers get-treasury-stats error branches", async () => {
    mocks.getCobuildAiContextSnapshot.mockResolvedValueOnce({
      data: null,
      error: "upstream unavailable",
    });
    expect(await executeTool("get-treasury-stats", {})).toEqual({
      ok: false,
      name: "get-treasury-stats",
      statusCode: 502,
      error: "get-treasury-stats request failed: upstream unavailable",
    });

    mocks.getCobuildAiContextSnapshot.mockRejectedValueOnce(new Error("boom"));
    expect(await executeTool("get-treasury-stats", {})).toEqual({
      ok: false,
      name: "get-treasury-stats",
      statusCode: 502,
      error: "get-treasury-stats request failed: boom",
    });
  });

  it("covers get-wallet-balances validation and auth branches", async () => {
    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
      scopes: ["tools:read"],
    });
    expect(await executeTool("get-wallet-balances", { network: "mainnet" })).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 400,
      error: 'network must be "base".',
    });

    expect(await executeTool("get-wallet-balances", { agentKey: "  " })).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 400,
      error: "agentKey must not be empty.",
    });

    mocks.requestContextGet.mockReturnValue(undefined);
    expect(await executeTool("get-wallet-balances", {})).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 401,
      error: "Authenticated tools principal is required for this tool.",
    });

    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
      scopes: ["tools:read"],
    });
    expect(await executeTool("get-wallet-balances", { agentKey: "ops" })).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 403,
      error: 'agentKey mismatch for this token. Expected "default".',
    });
  });

  it("covers list-wallet-notifications validation and auth branches", async () => {
    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
      scopes: ["tools:read", "notifications:read"],
    });
    expect(await executeTool("list-wallet-notifications", { limit: 0 })).toEqual({
      ok: false,
      name: "list-wallet-notifications",
      statusCode: 400,
      error: "limit must be between 1 and 50.",
    });

    expect(await executeTool("list-wallet-notifications", { unreadOnly: "yes" })).toEqual({
      ok: false,
      name: "list-wallet-notifications",
      statusCode: 400,
      error: "unreadOnly must be a boolean.",
    });

    expect(await executeTool("list-wallet-notifications", { kinds: ["unknown"] })).toEqual({
      ok: false,
      name: "list-wallet-notifications",
      statusCode: 400,
      error: 'kinds may only include "discussion", "payment", or "protocol".',
    });

    const unexpectedFieldResult = await executeTool("list-wallet-notifications", {
      walletAddress: "0x0000000000000000000000000000000000000001",
    });
    expect(unexpectedFieldResult.ok).toBe(false);
    if (!unexpectedFieldResult.ok) {
      expect(unexpectedFieldResult.statusCode).toBe(400);
      expect(unexpectedFieldResult.error).toContain("walletAddress");
    }

    mocks.requestContextGet.mockReturnValue(undefined);
    expect(await executeTool("list-wallet-notifications", {})).toEqual({
      ok: false,
      name: "list-wallet-notifications",
      statusCode: 401,
      error: "Authenticated tools principal is required for this tool.",
    });

    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
      scopes: ["tools:read", "notifications:read"],
    });
    expect(await executeTool("list-wallet-notifications", { cursor: "bad-cursor" })).toEqual({
      ok: false,
      name: "list-wallet-notifications",
      statusCode: 400,
      error: "cursor must be a valid notifications cursor.",
    });

    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
      scopes: ["tools:read"],
    });
    expect(await executeTool("list-wallet-notifications", {})).toEqual({
      ok: false,
      name: "list-wallet-notifications",
      statusCode: 403,
      error: "This token does not have notifications:read scope for the requested tool.",
    });

    mocks.execute.mockRejectedValueOnce(new Error("db unavailable"));
    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
      scopes: ["tools:read", "notifications:read"],
    });
    expect(await executeTool("list-wallet-notifications", {})).toEqual({
      ok: false,
      name: "list-wallet-notifications",
      statusCode: 502,
      error: "list-wallet-notifications request failed: db unavailable",
    });
  });

  it("executes get-wallet-balances with explicit matching agent on base", async () => {
    const getBalance = vi.fn().mockResolvedValue(10000000000000000n);
    const readContract = vi.fn().mockResolvedValue(500000n);
    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "ops",
      scopes: ["tools:read"],
    });
    mocks.createPublicClient.mockReturnValue({
      getBalance,
      readContract,
    });

    const result = await executeTool("get-wallet-balances", {
      network: "base",
      agentKey: "ops",
    });

    expect(result).toMatchObject({
      ok: true,
      name: "get-wallet-balances",
      output: {
        agentKey: "ops",
        network: "base",
      },
    });
    expect(readContract).toHaveBeenCalledWith({
      address: "0x833589fCD6EDB6E08F4C7C32D4F71B54BDA02913",
      abi: expect.any(Array),
      functionName: "balanceOf",
      args: ["0x0000000000000000000000000000000000000001"],
    });
  });

  it("returns 401 when tools principal owner address is invalid", async () => {
    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "not-an-address",
      agentKey: "default",
      scopes: ["tools:read"],
    });

    expect(await executeTool("get-wallet-balances", {})).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 401,
      error: "Authenticated tools principal is required for this tool.",
    });
  });

  it("returns 401 when tools principal context access throws", async () => {
    mocks.requestContextGet.mockImplementation(() => {
      throw new Error("context unavailable");
    });

    expect(await executeTool("get-wallet-balances", {})).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 401,
      error: "Authenticated tools principal is required for this tool.",
    });
  });

  it("returns 502 when balance fetch fails upstream", async () => {
    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
      scopes: ["tools:read"],
    });
    mocks.getOrSetCachedResultWithLock.mockRejectedValueOnce(new Error("rpc unavailable"));

    expect(await executeTool("get-wallet-balances", {})).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 502,
      error: "get-wallet-balances request failed: rpc unavailable",
    });
  });

  it("covers docs-search validation and upstream error branches", async () => {
    process.env.ENABLE_CLI_DOCS_SEARCH = "false";
    expect(await executeTool("docs-search", { query: "x" })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 403,
      error: "This tool is disabled.",
    });
    delete process.env.ENABLE_CLI_DOCS_SEARCH;

    delete process.env.DOCS_VECTOR_STORE_ID;
    delete process.env.OPENAI_API_KEY;

    expect(await executeTool("docs-search", { query: "x" })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 503,
      error: "Docs search is not configured (missing DOCS_VECTOR_STORE_ID).",
    });

    process.env.DOCS_VECTOR_STORE_ID = "vs_123";
    expect(await executeTool("docs-search", { query: "x" })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 503,
      error: "Docs search is not configured (missing OPENAI_API_KEY).",
    });

    process.env.OPENAI_API_KEY = "key";
    expect(await executeTool("docs-search", {})).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 400,
      error: "Query must be a string.",
    });
    expect(await executeTool("docs-search", { query: "   " })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 400,
      error: "Query must not be empty.",
    });
    expect(await executeTool("docs-search", { query: "x".repeat(1001) })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 400,
      error: "Query must be at most 1000 characters.",
    });
    expect(await executeTool("docs-search", { query: "x", limit: "nope" })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 400,
      error: "Limit must be an integer.",
    });
    expect(await executeTool("docs-search", { query: "x", limit: 25 })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 400,
      error: "Limit must be between 1 and 20.",
    });

    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })),
    );
    expect(await executeTool("docs-search", { query: "x", limit: 2 })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 502,
      error: "Docs search request failed: OpenAI vector store search request failed with status 500",
    });

    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(new Response("{not-json", { status: 200 })),
    );
    expect(await executeTool("docs-search", { query: "x", limit: 2 })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 502,
      error: "Docs search request failed: OpenAI vector store search returned invalid JSON.",
    });
  });

  it("covers list-discussions parse and failure branches", async () => {
    expect(await executeTool("list-discussions", { offset: "bad" })).toEqual({
      ok: false,
      name: "list-discussions",
      statusCode: 400,
      error: "offset must be an integer.",
    });
    expect(await executeTool("list-discussions", { offset: 10001 })).toEqual({
      ok: false,
      name: "list-discussions",
      statusCode: 400,
      error: "offset must be between 0 and 10000.",
    });

    mocks.execute.mockRejectedValueOnce(new Error("db timeout"));
    expect(await executeTool("list-discussions", {})).toEqual({
      ok: false,
      name: "list-discussions",
      statusCode: 502,
      error: "list-discussions request failed: db timeout",
    });
  });

  it("covers get-discussion-thread validation and not-found branches", async () => {
    const rootHash = `0x${"a".repeat(40)}`;

    expect(await executeTool("get-discussion-thread", {})).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "rootHash must be a full cast hash (0x + 40 hex chars).",
    });
    expect(await executeTool("get-discussion-thread", { rootHash, page: "x" })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "page must be an integer.",
    });
    expect(await executeTool("get-discussion-thread", { rootHash, page: 0 })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "page must be between 1 and 10000.",
    });
    expect(await executeTool("get-discussion-thread", { rootHash, pageSize: "x" })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "pageSize must be an integer.",
    });
    expect(await executeTool("get-discussion-thread", { rootHash, pageSize: 101 })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "pageSize must be between 1 and 100.",
    });
    expect(await executeTool("get-discussion-thread", { rootHash, focusHash: "bad" })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "focusHash must be a full cast hash (0x + 40 hex chars).",
    });

    mocks.execute.mockResolvedValueOnce({ rows: [] });
    expect(await executeTool("get-discussion-thread", { rootHash })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 404,
      error: "Discussion thread not found.",
    });

    mocks.execute.mockRejectedValueOnce(new Error("db fail"));
    expect(await executeTool("get-discussion-thread", { rootHash })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 502,
      error: "get-discussion-thread request failed: db fail",
    });
  });

  it("covers semantic-search-casts validation and embedding failure branches", async () => {
    expect(await executeTool("semantic-search-casts", {})).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 400,
      error: "query must be a string.",
    });
    expect(await executeTool("semantic-search-casts", { query: "   " })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 400,
      error: "query must not be empty.",
    });
    expect(await executeTool("semantic-search-casts", { query: "x", limit: "bad" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 400,
      error: "limit must be an integer.",
    });
    expect(await executeTool("semantic-search-casts", { query: "x", limit: 30 })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 400,
      error: "limit must be between 1 and 25.",
    });
    expect(await executeTool("semantic-search-casts", { query: "x", rootHash: "bad" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 400,
      error: "rootHash must be a full cast hash (0x + 40 hex chars).",
    });

    delete process.env.OPENAI_API_KEY;
    expect(await executeTool("semantic-search-casts", { query: "x" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 503,
      error: "semantic-search-casts request failed: OPENAI_API_KEY is not configured.",
    });

    process.env.OPENAI_API_KEY = "key";
    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })),
    );
    expect(await executeTool("semantic-search-casts", { query: "x" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 502,
      error: "semantic-search-casts request failed: OpenAI embeddings request failed with status 500",
    });

    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(new Response("{bad", { status: 200 })),
    );
    expect(await executeTool("semantic-search-casts", { query: "x" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 502,
      error: "semantic-search-casts request failed: OpenAI embeddings returned invalid JSON.",
    });

    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    expect(await executeTool("semantic-search-casts", { query: "x" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 502,
      error: "semantic-search-casts request failed: OpenAI embeddings response is missing data.",
    });

    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [{}] }), { status: 200 })),
    );
    expect(await executeTool("semantic-search-casts", { query: "x" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 502,
      error: "semantic-search-casts request failed: OpenAI embeddings response is missing embedding values.",
    });

    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ embedding: [] }] }), { status: 200 }),
      ),
    );
    expect(await executeTool("semantic-search-casts", { query: "x" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 502,
      error: "semantic-search-casts request failed: OpenAI embeddings dimension mismatch: expected 256, got 0",
    });
  });

  it("executes semantic-search-casts without rootHash and normalizes nullable rows", async () => {
    process.env.OPENAI_API_KEY = "key";
    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(embeddingPayload()), { status: 200 })),
    );
    mocks.execute.mockResolvedValueOnce({
      rows: [
        {
          hashHex: "f".repeat(40),
          parentHashHex: null,
          rootHashHex: "f".repeat(40),
          text: null,
          castTimestamp: null,
          distance: null,
          authorFid: null,
          authorFname: null,
          authorDisplayName: null,
          authorAvatarUrl: null,
          authorNeynarScore: null,
        },
      ],
    });

    const result = await executeTool("semantic-search-casts", { query: "nullable row test" });
    expect(result).toMatchObject({
      ok: true,
      output: {
        query: "nullable row test",
        count: 1,
        items: [
          {
            hash: `0x${"f".repeat(40)}`,
            parentHash: null,
            rootHash: `0x${"f".repeat(40)}`,
            text: "",
            authorUsername: "unknown",
            createdAt: null,
            distance: 1,
            similarity: 0,
            author: {
              fid: null,
              username: "unknown",
              display_name: null,
              pfp_url: null,
              neynar_score: null,
            },
          },
        ],
      },
    });
    if (result.ok) {
      expect(result.output).not.toHaveProperty("rootHash");
    }
  });

  it("uses fid fallback for author usernames when fname/display are missing", async () => {
    process.env.OPENAI_API_KEY = "key";
    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(embeddingPayload()), { status: 200 })),
    );
    mocks.execute.mockResolvedValueOnce({
      rows: [
        {
          hashHex: "9".repeat(40),
          parentHashHex: null,
          rootHashHex: "9".repeat(40),
          text: "fallback user",
          castTimestamp: "2026-03-02T00:00:00.000Z",
          distance: 0.1,
          authorFid: 88,
          authorFname: null,
          authorDisplayName: null,
          authorAvatarUrl: null,
          authorNeynarScore: 0.6,
        },
      ],
    });

    const result = await executeTool("semantic-search-casts", { query: "fid fallback" });
    expect(result).toMatchObject({
      ok: true,
      output: {
        items: [
          {
            hash: `0x${"9".repeat(40)}`,
            authorUsername: "fid:88",
            author: {
              fid: 88,
              username: "fid:88",
            },
          },
        ],
      },
    });
  });

  it("covers get-treasury-stats unknown-error fallback message", async () => {
    mocks.getCobuildAiContextSnapshot.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await executeTool("get-treasury-stats", {});
    expect(result).toEqual({
      ok: false,
      name: "get-treasury-stats",
      statusCode: 502,
      error: "get-treasury-stats request failed: unknown error",
    });
  });
});
