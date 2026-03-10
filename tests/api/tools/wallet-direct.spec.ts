import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToolsPrincipalFromContext: vi.fn(),
  listWalletNotifications: vi.fn(),
}));

vi.mock("../../../src/domains/notifications/wallet-subject", () => ({
  getToolsPrincipalFromContext: mocks.getToolsPrincipalFromContext,
}));

vi.mock("../../../src/domains/notifications/service", () => {
  class WalletNotificationsSubjectRequiredError extends Error {}
  class InvalidWalletNotificationsCursorError extends Error {}

  return {
    listWalletNotifications: mocks.listWalletNotifications,
    WalletNotificationsSubjectRequiredError,
    InvalidWalletNotificationsCursorError,
  };
});

import {
  InvalidWalletNotificationsCursorError,
  WalletNotificationsSubjectRequiredError,
} from "../../../src/domains/notifications/service";
import { walletToolDefinitions } from "../../../src/tools/registry/wallet";

const getWalletBalancesTool = walletToolDefinitions.find(
  (tool) => tool.name === "get-wallet-balances",
);
const listWalletNotificationsTool = walletToolDefinitions.find(
  (tool) => tool.name === "list-wallet-notifications",
);

describe("wallet tool direct execution branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps invalid tools principal owner addresses to internal tool failures", async () => {
    mocks.getToolsPrincipalFromContext.mockReturnValue({
      ownerAddress: "not-an-address",
      agentKey: "default",
      scopes: ["tools:read"],
    });

    const result = await getWalletBalancesTool?.execute({
      network: "base",
    });

    expect(result).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 500,
      error: "Tool request failed.",
    });
  });

  it("maps wallet subject and cursor errors from the notifications service", async () => {
    mocks.listWalletNotifications
      .mockRejectedValueOnce(new WalletNotificationsSubjectRequiredError())
      .mockRejectedValueOnce(new InvalidWalletNotificationsCursorError());

    const subjectRequired = await listWalletNotificationsTool?.execute({
      limit: 20,
      unreadOnly: false,
    });
    const invalidCursor = await listWalletNotificationsTool?.execute({
      limit: 20,
      unreadOnly: false,
    });

    expect(subjectRequired).toEqual({
      ok: false,
      name: "list-wallet-notifications",
      statusCode: 401,
      error: "Authenticated subject wallet is required to list wallet notifications.",
    });
    expect(invalidCursor).toEqual({
      ok: false,
      name: "list-wallet-notifications",
      statusCode: 400,
      error: "cursor must be a valid notifications cursor.",
    });
  });

  it("publishes the narrowed wallet notification payload schema", () => {
    const outputSchema = listWalletNotificationsTool?.outputSchema as Record<string, any> | undefined;
    const payloadSchema = outputSchema?.properties?.items?.items?.properties?.payload;
    const protocolSchema = payloadSchema?.anyOf?.[0];

    expect(payloadSchema).toMatchObject({
      anyOf: [
        {
          type: "object",
          required: ["role", "resource", "actor", "labels", "schedule", "amounts", "reward"],
          additionalProperties: true,
          properties: {
            role: {
              anyOf: [
                {
                  type: "string",
                  enum: expect.arrayContaining([
                    "requester",
                    "challenger",
                    "proposer",
                    "budget_controller",
                    "goal_owner",
                    "goal_stakeholder",
                    "goal_underwriter",
                    "budget_underwriter",
                    "juror",
                  ]),
                },
                { type: "null" },
              ],
            },
            actor: {
              anyOf: [
                {
                  type: "object",
                  required: ["walletAddress"],
                  additionalProperties: true,
                },
                { type: "null" },
              ],
            },
            labels: {
              anyOf: [
                {
                  type: "object",
                  required: [
                    "goalName",
                    "budgetName",
                    "mechanismName",
                    "reminderContextLabel",
                  ],
                  additionalProperties: true,
                },
                { type: "null" },
              ],
            },
            schedule: {
              anyOf: [
                {
                  type: "object",
                  required: [
                    "deliverAt",
                    "votingStartAt",
                    "votingEndAt",
                    "revealEndAt",
                    "challengeWindowEndAt",
                    "reassertGraceDeadline",
                  ],
                  additionalProperties: true,
                },
                { type: "null" },
              ],
            },
            reward: {
              anyOf: [
                {
                  type: "object",
                  required: ["bucket", "bucketLabel"],
                  additionalProperties: true,
                },
                { type: "null" },
              ],
            },
          },
        },
        {
          type: "object",
          required: ["amount"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    });

    expect(protocolSchema?.properties?.resource?.anyOf?.[0]?.required).toEqual([
      "kind",
      "goalTreasury",
      "budgetTreasury",
      "itemId",
      "requestIndex",
      "arbitrator",
      "disputeId",
    ]);
    expect(protocolSchema?.properties?.amounts?.anyOf?.[0]?.required).toEqual([
      "allocatedStake",
      "claimable",
      "claimedAmount",
      "snapshotWeight",
      "snapshotVotes",
      "slashWeight",
    ]);
  });
});
