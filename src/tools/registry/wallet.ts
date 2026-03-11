import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  ProtocolNotificationActor,
  ProtocolNotificationAmounts,
  ProtocolNotificationLabels,
  ProtocolNotificationResource,
  ProtocolNotificationReward,
  ProtocolNotificationRole,
  ProtocolNotificationSchedule,
} from "@cobuild/wire";
import { and, eq } from "drizzle-orm";
import { base } from "viem/chains";
import {
  createPublicClient,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  http,
  type Address,
} from "viem";
import {
  LIST_WALLET_NOTIFICATIONS_CURSOR_MAX_LENGTH,
  LIST_WALLET_NOTIFICATIONS_DEFAULT_LIMIT,
  LIST_WALLET_NOTIFICATIONS_LIMIT_MAX,
  LIST_WALLET_NOTIFICATIONS_LIMIT_MIN,
  NOTIFICATION_KINDS,
} from "../../domains/notifications/types";
import {
  InvalidWalletNotificationsCursorError,
  WalletNotificationsSubjectRequiredError,
  listWalletNotifications,
} from "../../domains/notifications/service";
import { getToolsPrincipalFromContext } from "../../domains/notifications/wallet-subject";
import { getOrSetCachedResultWithLock } from "../../infra/cache/cacheResult";
import { cobuildPrimaryDb } from "../../infra/db/cobuildDb";
import { cliAgentWallets } from "../../infra/db/schema";
import {
  NO_STORE_CACHE_CONTROL,
  SHORT_PRIVATE_CACHE_CONTROL,
  failureFromPublicError,
  success,
} from "./runtime";
import {
  SUBJECT_WALLET_NOTIFICATIONS_READ_TOOL_AUTH_POLICY,
  SUBJECT_WALLET_READ_TOOL_AUTH_POLICY,
  type JsonSchema,
  type RawRegisteredTool,
} from "./types";

const GET_WALLET_BALANCES_CACHE_PREFIX = "cli-tools:get-wallet-balances:";
const GET_WALLET_BALANCES_CACHE_TTL_SECONDS = 30;
const BASE_RPC_URL_ENV = "COBUILD_BASE_RPC_URL";
const DEFAULT_BASE_RPC_URL = "https://mainnet.base.org";
const RPC_TIMEOUT_MS = 7_000;
const RPC_RETRY_COUNT = 1;
const USDC_DECIMALS = 6;
const BASE_USDC_CONTRACT = "0x833589fCD6EDB6E08F4C7C32D4F71B54BDA02913" as Address;
const CLI_SMART_ACCOUNT_PREFIX = "cli-smart";

const getWalletBalancesInputSchema = z.object({
  agentKey: z.string().trim().min(1).max(128).optional(),
  network: z.literal("base").default("base"),
}).strict();

const listWalletNotificationsInputSchema = z.object({
  limit: z.number()
    .int()
    .min(LIST_WALLET_NOTIFICATIONS_LIMIT_MIN)
    .max(LIST_WALLET_NOTIFICATIONS_LIMIT_MAX)
    .default(LIST_WALLET_NOTIFICATIONS_DEFAULT_LIMIT),
  cursor: z.string().trim().min(1).max(LIST_WALLET_NOTIFICATIONS_CURSOR_MAX_LENGTH).optional(),
  unreadOnly: z.boolean().default(false),
  kinds: z.array(z.enum(NOTIFICATION_KINDS)).min(1).max(NOTIFICATION_KINDS.length).optional(),
}).strict();

const nullableStringSchema: JsonSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
};

const protocolNotificationRoleValues = [
  "requester",
  "challenger",
  "proposer",
  "budget_controller",
  "goal_owner",
  "goal_stakeholder",
  "goal_underwriter",
  "budget_underwriter",
  "juror",
] as const satisfies readonly ProtocolNotificationRole[];

const protocolNotificationSectionContracts = {
  resource: {
    kind: null,
    goalTreasury: null,
    budgetTreasury: null,
    itemId: null,
    requestIndex: null,
    arbitrator: null,
    disputeId: null,
  } satisfies ProtocolNotificationResource,
  actor: {
    walletAddress: null,
  } satisfies ProtocolNotificationActor,
  labels: {
    goalName: null,
    budgetName: null,
    mechanismName: null,
    reminderContextLabel: null,
  } satisfies ProtocolNotificationLabels,
  schedule: {
    deliverAt: null,
    votingStartAt: null,
    votingEndAt: null,
    revealEndAt: null,
    challengeWindowEndAt: null,
    reassertGraceDeadline: null,
  } satisfies ProtocolNotificationSchedule,
  amounts: {
    allocatedStake: null,
    claimable: null,
    claimedAmount: null,
    snapshotWeight: null,
    snapshotVotes: null,
    slashWeight: null,
  } satisfies ProtocolNotificationAmounts,
  reward: {
    bucket: null,
    bucketLabel: null,
  } satisfies ProtocolNotificationReward,
};

function buildObjectSchema(
  properties: Record<string, JsonSchema>,
  additionalProperties: boolean,
): JsonSchema {
  return {
    type: "object",
    required: Object.keys(properties),
    properties,
    additionalProperties,
  };
}

function buildNullableObjectSchema(
  properties: Record<string, JsonSchema>,
  additionalProperties = true,
): JsonSchema {
  return {
    anyOf: [
      buildObjectSchema(properties, additionalProperties),
      { type: "null" },
    ],
  };
}

function buildNullableStringProperties<T extends Record<string, unknown>>(
  defaults: T,
): Record<keyof T & string, JsonSchema> {
  return Object.fromEntries(
    Object.keys(defaults).map((key) => [key, nullableStringSchema]),
  ) as Record<keyof T & string, JsonSchema>;
}

function buildProtocolNotificationSectionSchema<T extends Record<string, unknown>>(
  contract: T,
): JsonSchema {
  return buildNullableObjectSchema(buildNullableStringProperties(contract));
}

const protocolNotificationSectionSchemas: Record<
  keyof typeof protocolNotificationSectionContracts,
  JsonSchema
> = {
  actor: buildProtocolNotificationSectionSchema(protocolNotificationSectionContracts.actor),
  resource: buildProtocolNotificationSectionSchema(protocolNotificationSectionContracts.resource),
  labels: buildProtocolNotificationSectionSchema(protocolNotificationSectionContracts.labels),
  schedule: buildProtocolNotificationSectionSchema(protocolNotificationSectionContracts.schedule),
  amounts: buildProtocolNotificationSectionSchema(protocolNotificationSectionContracts.amounts),
  reward: buildProtocolNotificationSectionSchema(protocolNotificationSectionContracts.reward),
};

const protocolNotificationPayloadProperties: Record<
  "role" | keyof typeof protocolNotificationSectionContracts,
  JsonSchema
> = {
  role: {
    anyOf: [
      {
        type: "string",
        enum: [...protocolNotificationRoleValues],
      },
      { type: "null" },
    ],
  },
  ...protocolNotificationSectionSchemas,
};

const protocolNotificationPayloadSchema = buildObjectSchema(
  protocolNotificationPayloadProperties,
  true,
);

const paymentNotificationPayloadSchema = {
  type: "object",
  required: ["amount"],
  properties: {
    amount: nullableStringSchema,
  },
  additionalProperties: false,
};

const walletNotificationPayloadSchema = {
  anyOf: [
    protocolNotificationPayloadSchema,
    paymentNotificationPayloadSchema,
    { type: "null" },
  ],
};

function getWalletBalanceRpcUrl(): string {
  const configured = process.env[BASE_RPC_URL_ENV]?.trim();
  return configured || DEFAULT_BASE_RPC_URL;
}

function getWalletBalanceNetworkConfig() {
  return {
    chain: base,
    rpcUrl: getWalletBalanceRpcUrl(),
    usdcAddress: BASE_USDC_CONTRACT,
  };
}

function deterministicHostedExecutionWalletAccountName(params: {
  ownerAddress: string;
  agentKey: string;
}): string {
  const seed = `${params.ownerAddress}:${params.agentKey}`;
  const suffix = createHash("sha256").update(seed).digest("hex").slice(0, 20);
  return `${CLI_SMART_ACCOUNT_PREFIX}-${suffix}`;
}

async function resolveHostedWalletAddress(params: {
  ownerAddress: string;
  agentKey: string;
}): Promise<Address | null> {
  const rows = await cobuildPrimaryDb()
    .select({
      address: cliAgentWallets.address,
      cdpAccountName: cliAgentWallets.cdpAccountName,
    })
    .from(cliAgentWallets)
    .where(
      and(
        eq(cliAgentWallets.ownerAddress, params.ownerAddress),
        eq(cliAgentWallets.agentKey, params.agentKey),
      ),
    )
    .limit(1);

  const row = rows[0];
  const address = row?.address;
  const cdpAccountName = row?.cdpAccountName;
  if (
    typeof address !== "string" ||
    address.length === 0 ||
    typeof cdpAccountName !== "string" ||
    cdpAccountName !== deterministicHostedExecutionWalletAccountName(params)
  ) {
    return null;
  }

  return getAddress(address).toLowerCase() as Address;
}

async function executeGetWalletBalances(
  input: z.infer<typeof getWalletBalancesInputSchema>,
) {
  const name = "get-wallet-balances";
  const principal = getToolsPrincipalFromContext();
  if (!principal) {
    return failureFromPublicError(name, "toolPrincipalRequired");
  }

  if (input.agentKey && input.agentKey !== principal.agentKey) {
    return failureFromPublicError(name, "toolAgentKeyMismatch");
  }

  let ownerAddress: Address;
  try {
    ownerAddress = getAddress(principal.ownerAddress).toLowerCase() as Address;
  } catch {
    return failureFromPublicError(name, "toolInternalError");
  }

  let walletAddress: Address | null;
  try {
    walletAddress = await resolveHostedWalletAddress({
      ownerAddress,
      agentKey: principal.agentKey,
    });
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
  if (!walletAddress) {
    return failureFromPublicError(name, "toolHostedWalletRequired");
  }

  const agentKey = input.agentKey ?? principal.agentKey;
  const network = input.network;
  const { chain, rpcUrl, usdcAddress } = getWalletBalanceNetworkConfig();

  try {
    const cachedOutput = await getOrSetCachedResultWithLock(
      `${network}:${walletAddress}`,
      GET_WALLET_BALANCES_CACHE_PREFIX,
      async () => {
        const client = createPublicClient({
          chain,
          transport: http(rpcUrl, {
            timeout: RPC_TIMEOUT_MS,
            retryCount: RPC_RETRY_COUNT,
          }),
        });

        const [ethBalanceWei, usdcBalanceRaw] = await Promise.all([
          client.getBalance({ address: walletAddress }),
          client.readContract({
            address: usdcAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress],
          }),
        ]);

        return {
          network,
          walletAddress,
          balances: {
            eth: {
              wei: ethBalanceWei.toString(),
              formatted: formatEther(ethBalanceWei),
            },
            usdc: {
              raw: usdcBalanceRaw.toString(),
              decimals: USDC_DECIMALS,
              formatted: formatUnits(usdcBalanceRaw, USDC_DECIMALS),
              contract: usdcAddress,
            },
          },
        };
      },
      GET_WALLET_BALANCES_CACHE_TTL_SECONDS,
    );

    return success(
      name,
      {
        agentKey,
        ...cachedOutput,
      },
      SHORT_PRIVATE_CACHE_CONTROL,
    );
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

async function executeListWalletNotifications(
  input: z.infer<typeof listWalletNotificationsInputSchema>,
) {
  const name = "list-wallet-notifications";

  try {
    const output = await listWalletNotifications({
      limit: input.limit,
      cursor: input.cursor,
      unreadOnly: input.unreadOnly,
      kinds: input.kinds,
    });

    return success(name, output, NO_STORE_CACHE_CONTROL);
  } catch (error) {
    if (error instanceof WalletNotificationsSubjectRequiredError) {
      return failureFromPublicError(name, "toolWalletSubjectRequired");
    }
    if (error instanceof InvalidWalletNotificationsCursorError) {
      return failureFromPublicError(name, "toolNotificationsCursorInvalid");
    }
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

export const walletToolDefinitions: RawRegisteredTool[] = [
  {
    name: "get-wallet-balances",
    aliases: ["getWalletBalances", "walletBalances"],
    description: "Fetch ETH and USDC balances for the hosted execution wallet associated with the authenticated CLI token.",
    input: getWalletBalancesInputSchema,
    outputSchema: {
      type: "object",
      required: ["agentKey", "network", "walletAddress", "balances"],
      properties: {
        agentKey: { type: "string" },
        network: { type: "string" },
        walletAddress: { type: "string" },
        balances: {
          type: "object",
          required: ["eth", "usdc"],
          properties: {
            eth: {
              type: "object",
              required: ["wei", "formatted"],
              properties: {
                wei: { type: "string" },
                formatted: { type: "string" },
              },
              additionalProperties: false,
            },
            usdc: {
              type: "object",
              required: ["raw", "decimals", "formatted", "contract"],
              properties: {
                raw: { type: "string" },
                decimals: { type: "number" },
                formatted: { type: "string" },
                contract: { type: "string" },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    scopes: ["cli-tools", "wallet"],
    authPolicy: SUBJECT_WALLET_READ_TOOL_AUTH_POLICY,
    sideEffects: "network-read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetWalletBalances,
  },
  {
    name: "list-wallet-notifications",
    aliases: ["listWalletNotifications", "walletNotifications"],
    description: "List notifications for the authenticated subject wallet inbox.",
    input: listWalletNotificationsInputSchema,
    outputSchema: {
      type: "object",
      required: ["subjectWalletAddress", "items", "pageInfo", "unread"],
      properties: {
        subjectWalletAddress: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            required: [
              "id",
              "kind",
              "reason",
              "eventAt",
              "createdAt",
              "isUnread",
              "actor",
              "summary",
              "resource",
              "payload",
            ],
            properties: {
              id: { type: "string" },
              kind: { type: "string" },
              reason: { type: "string" },
              eventAt: { anyOf: [{ type: "string" }, { type: "null" }] },
              createdAt: { type: "string" },
              isUnread: { type: "boolean" },
              actor: {
                anyOf: [
                  {
                    type: "object",
                    required: ["fid", "walletAddress", "name", "username", "avatarUrl"],
                    properties: {
                      fid: { anyOf: [{ type: "number" }, { type: "null" }] },
                      walletAddress: { anyOf: [{ type: "string" }, { type: "null" }] },
                      name: { anyOf: [{ type: "string" }, { type: "null" }] },
                      username: { anyOf: [{ type: "string" }, { type: "null" }] },
                      avatarUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
                    },
                    additionalProperties: false,
                  },
                  { type: "null" },
                ],
              },
              summary: {
                type: "object",
                required: ["title", "excerpt"],
                properties: {
                  title: { anyOf: [{ type: "string" }, { type: "null" }] },
                  excerpt: { anyOf: [{ type: "string" }, { type: "null" }] },
                },
                additionalProperties: false,
              },
              resource: {
                type: "object",
                required: [
                  "sourceType",
                  "sourceId",
                  "sourceHash",
                  "rootHash",
                  "targetHash",
                  "appPath",
                ],
                properties: {
                  sourceType: { type: "string" },
                  sourceId: { type: "string" },
                  sourceHash: { anyOf: [{ type: "string" }, { type: "null" }] },
                  rootHash: { anyOf: [{ type: "string" }, { type: "null" }] },
                  targetHash: { anyOf: [{ type: "string" }, { type: "null" }] },
                  appPath: { anyOf: [{ type: "string" }, { type: "null" }] },
                },
                additionalProperties: false,
              },
              payload: {
                ...walletNotificationPayloadSchema,
              },
            },
            additionalProperties: false,
          },
        },
        pageInfo: {
          type: "object",
          required: ["limit", "nextCursor", "hasMore"],
          properties: {
            limit: { type: "number" },
            nextCursor: { anyOf: [{ type: "string" }, { type: "null" }] },
            hasMore: { type: "boolean" },
          },
          additionalProperties: false,
        },
        unread: {
          type: "object",
          required: ["count", "watermark"],
          properties: {
            count: { type: "number" },
            watermark: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    scopes: ["cli-tools", "wallet", "notifications"],
    authPolicy: SUBJECT_WALLET_NOTIFICATIONS_READ_TOOL_AUTH_POLICY,
    sideEffects: "read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeListWalletNotifications,
  },
];
