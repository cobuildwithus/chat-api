import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIST_WALLET_NOTIFICATIONS_CURSOR_MAX_LENGTH,
  LIST_WALLET_NOTIFICATIONS_DEFAULT_LIMIT,
  LIST_WALLET_NOTIFICATIONS_LIMIT_MAX,
  LIST_WALLET_NOTIFICATIONS_LIMIT_MIN,
  NOTIFICATION_KINDS,
} from "@cobuild/wire";

const mocks = vi.hoisted(() => ({
  getToolsPrincipalFromContext: vi.fn(),
  listWalletNotifications: vi.fn(),
  hostedWalletRows: [] as Array<{ address: string }>,
  hostedWalletLookupError: null as Error | null,
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

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("../../../src/infra/db/cobuildDb", () => ({
  cobuildPrimaryDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (mocks.hostedWalletLookupError) {
              throw mocks.hostedWalletLookupError;
            }
            return mocks.hostedWalletRows;
          },
        }),
      }),
    }),
  }),
}));

vi.mock("../../../src/infra/db/schema", () => ({
  cliAgentWallets: {
    address: "address",
    ownerAddress: "ownerAddress",
    agentKey: "agentKey",
  },
}));

import {
  InvalidWalletNotificationsCursorError,
  WalletNotificationsSubjectRequiredError,
} from "../../../src/domains/notifications/service";
import { walletToolDefinitions } from "../../../src/tools/registry/wallet";

const wireProtocolNotificationsTypesSource = readFileSync(
  join(process.cwd(), "node_modules", "@cobuild", "wire", "dist", "protocol-notifications.d.ts"),
  "utf8",
);

function extractInterfacePropertyNames(source: string, interfaceName: string): string[] {
  const match = new RegExp(
    `export interface ${interfaceName}[^\\{]*\\{([\\s\\S]*?)\\n\\}`,
    "m",
  ).exec(source);
  if (!match) {
    throw new Error(`Missing interface ${interfaceName} in @cobuild/wire declarations.`);
  }

  return Array.from(match[1].matchAll(/^\s*([A-Za-z0-9_]+):/gm), ([, property]) => property);
}

function extractUnionValues(source: string, typeName: string): string[] {
  const match = new RegExp(`export type ${typeName} = ([^;]+);`, "m").exec(source);
  if (!match) {
    throw new Error(`Missing type ${typeName} in @cobuild/wire declarations.`);
  }

  return Array.from(match[1].matchAll(/"([^"]+)"/g), ([, value]) => value);
}

const protocolNotificationContract = {
  roleValues: extractUnionValues(wireProtocolNotificationsTypesSource, "ProtocolNotificationRole"),
  payloadKeys: extractInterfacePropertyNames(
    wireProtocolNotificationsTypesSource,
    "ProtocolNotificationPayload",
  ),
  actorKeys: extractInterfacePropertyNames(
    wireProtocolNotificationsTypesSource,
    "ProtocolNotificationActor",
  ),
  resourceKeys: extractInterfacePropertyNames(
    wireProtocolNotificationsTypesSource,
    "ProtocolNotificationResource",
  ),
  labelsKeys: extractInterfacePropertyNames(
    wireProtocolNotificationsTypesSource,
    "ProtocolNotificationLabels",
  ),
  scheduleKeys: extractInterfacePropertyNames(
    wireProtocolNotificationsTypesSource,
    "ProtocolNotificationSchedule",
  ),
  amountsKeys: extractInterfacePropertyNames(
    wireProtocolNotificationsTypesSource,
    "ProtocolNotificationAmounts",
  ),
  rewardKeys: extractInterfacePropertyNames(
    wireProtocolNotificationsTypesSource,
    "ProtocolNotificationReward",
  ),
};

const nullableStringSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
};

const getWalletBalancesTool = walletToolDefinitions.find(
  (tool) => tool.name === "get-wallet-balances",
);
const listWalletNotificationsTool = walletToolDefinitions.find(
  (tool) => tool.name === "list-wallet-notifications",
);

describe("wallet tool direct execution branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hostedWalletRows = [];
    mocks.hostedWalletLookupError = null;
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

  it("maps hosted wallet lookup failures to tool execution failures", async () => {
    mocks.getToolsPrincipalFromContext.mockReturnValue({
      ownerAddress: "0x00000000000000000000000000000000000000aa",
      agentKey: "default",
      scopes: ["tools:read"],
    });
    mocks.hostedWalletLookupError = new Error("db unavailable");

    const result = await getWalletBalancesTool?.execute({
      network: "base",
    });

    expect(result).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 502,
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

  it("publishes the shared wire protocol payload contract", () => {
    const outputSchema = listWalletNotificationsTool?.outputSchema as Record<string, any> | undefined;
    const payloadSchema = outputSchema?.properties?.items?.items?.properties?.payload;
    const protocolSchema = payloadSchema?.anyOf?.[0];

    expect(payloadSchema?.anyOf).toHaveLength(3);
    expect(payloadSchema?.anyOf?.[1]).toEqual({
      type: "object",
      required: ["amount"],
      properties: {
        amount: nullableStringSchema,
      },
      additionalProperties: false,
    });
    expect(payloadSchema?.anyOf?.[2]).toEqual({ type: "null" });

    expect(protocolSchema).toMatchObject({
      type: "object",
      additionalProperties: true,
      properties: {
        role: {
          anyOf: [
            {
              type: "string",
              enum: protocolNotificationContract.roleValues,
            },
            { type: "null" },
          ],
        },
      },
    });
    expect([...protocolSchema?.required ?? []].sort()).toEqual(
      [...protocolNotificationContract.payloadKeys].sort(),
    );

    const nestedContractKeys = {
      actor: protocolNotificationContract.actorKeys,
      resource: protocolNotificationContract.resourceKeys,
      labels: protocolNotificationContract.labelsKeys,
      schedule: protocolNotificationContract.scheduleKeys,
      amounts: protocolNotificationContract.amountsKeys,
      reward: protocolNotificationContract.rewardKeys,
    };

    for (const [property, required] of Object.entries(nestedContractKeys)) {
      expect(protocolSchema?.properties?.[property]).toMatchObject({
        anyOf: [
          {
            type: "object",
            properties: Object.fromEntries(
              required.map((field) => [field, nullableStringSchema]),
            ),
            additionalProperties: true,
          },
          { type: "null" },
        ],
      });
      expect(
        [...(protocolSchema?.properties?.[property]?.anyOf?.[0]?.required ?? [])].sort(),
      ).toEqual([...required].sort());
    }
  });

  it("enforces the shared wire-backed notification list controls", () => {
    const inputSchema = listWalletNotificationsTool?.input;

    expect(inputSchema?.safeParse({}).data).toEqual({
      limit: LIST_WALLET_NOTIFICATIONS_DEFAULT_LIMIT,
      unreadOnly: false,
    });
    expect(
      inputSchema?.safeParse({
        limit: LIST_WALLET_NOTIFICATIONS_LIMIT_MIN,
        unreadOnly: false,
        cursor: "x".repeat(LIST_WALLET_NOTIFICATIONS_CURSOR_MAX_LENGTH),
        kinds: [...NOTIFICATION_KINDS],
      }).success,
    ).toBe(true);
    expect(
      inputSchema?.safeParse({
        limit: LIST_WALLET_NOTIFICATIONS_LIMIT_MIN - 1,
        unreadOnly: false,
      }).success,
    ).toBe(false);
    expect(
      inputSchema?.safeParse({
        limit: LIST_WALLET_NOTIFICATIONS_LIMIT_MAX + 1,
        unreadOnly: false,
      }).success,
    ).toBe(false);
    expect(
      inputSchema?.safeParse({
        limit: LIST_WALLET_NOTIFICATIONS_DEFAULT_LIMIT,
        unreadOnly: false,
        cursor: "x".repeat(LIST_WALLET_NOTIFICATIONS_CURSOR_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      inputSchema?.safeParse({
        limit: LIST_WALLET_NOTIFICATIONS_DEFAULT_LIMIT,
        unreadOnly: false,
        kinds: ["mystery"],
      }).success,
    ).toBe(false);
  });
});
