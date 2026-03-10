import { z } from "zod";
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
  InvalidWalletNotificationsCursorError,
  WalletNotificationsSubjectRequiredError,
  listWalletNotifications,
} from "../../domains/notifications/service";
import { NOTIFICATION_KINDS } from "../../domains/notifications/types";
import { getToolsPrincipalFromContext } from "../../domains/notifications/wallet-subject";
import { getOrSetCachedResultWithLock } from "../../infra/cache/cacheResult";
import {
  NO_STORE_CACHE_CONTROL,
  SHORT_PRIVATE_CACHE_CONTROL,
  failureFromPublicError,
  success,
} from "./runtime";
import {
  SUBJECT_WALLET_NOTIFICATIONS_READ_TOOL_AUTH_POLICY,
  SUBJECT_WALLET_READ_TOOL_AUTH_POLICY,
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

const getWalletBalancesInputSchema = z.object({
  agentKey: z.string().trim().min(1).max(128).optional(),
  network: z.literal("base").default("base"),
}).strict();

const listWalletNotificationsInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(512).optional(),
  unreadOnly: z.boolean().default(false),
  kinds: z.array(z.enum(NOTIFICATION_KINDS)).min(1).max(NOTIFICATION_KINDS.length).optional(),
}).strict();

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

  /* c8 ignore next 5 -- ownerAddress is normalized by getToolsPrincipalFromContext */
  let walletAddress: Address;
  try {
    walletAddress = getAddress(principal.ownerAddress).toLowerCase() as Address;
  } catch {
    return failureFromPublicError(name, "toolInternalError");
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
    description: "Fetch ETH and USDC balances for the authenticated CLI wallet.",
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
                anyOf: [
                  {
                    type: "object",
                    additionalProperties: true,
                  },
                  { type: "null" },
                ],
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
