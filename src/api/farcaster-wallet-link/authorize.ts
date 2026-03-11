import type { FastifyReply } from "fastify";
import { createPublicClient, http } from "viem";
import { optimism } from "viem/chains";
import { getToolsPrincipal, type ToolsPrincipal } from "../auth/principals";
import { getPublicError, toPublicErrorBody } from "../../public-errors";
import { readHostedCliWalletAddress } from "../../infra/db/queries/cli-wallet/read-hosted-wallet-address";

const DEFAULT_OPTIMISM_RPC_URL = "https://mainnet.optimism.io";
const OPTIMISM_RPC_TIMEOUT_MS = 7_000;
const OPTIMISM_RPC_RETRY_COUNT = 1;
const FARCASTER_ID_REGISTRY_ADDRESS = "0x00000000fc6c5f01fc30151999387bb99a9f489b" as const;
const FARCASTER_ID_REGISTRY_ABI = [
  {
    type: "function",
    name: "idOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "fid", type: "uint256" }],
  },
] as const;

function getOptimismRpcUrl(): string {
  const configured = process.env.COBUILD_OPTIMISM_RPC_URL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_OPTIMISM_RPC_URL;
}

async function resolveAuthorizedWalletAddress(
  requestedAddress: `0x${string}`,
  principal: ToolsPrincipal,
): Promise<`0x${string}` | null> {
  if (requestedAddress === principal.ownerAddress) {
    return requestedAddress;
  }

  const hostedWalletAddress = await readHostedCliWalletAddress({
    ownerAddress: principal.ownerAddress,
    agentKey: principal.agentKey,
  });

  return hostedWalletAddress === requestedAddress ? hostedWalletAddress : null;
}

export async function authorizeFarcasterWalletLink(params: {
  fid: number;
  address: `0x${string}`;
  reply: FastifyReply;
}): Promise<boolean> {
  const principal = getToolsPrincipal();
  if (!principal) {
    const error = getPublicError("toolPrincipalRequired");
    params.reply.status(error.statusCode).send(toPublicErrorBody("toolPrincipalRequired"));
    return false;
  }

  const authorizedAddress = await resolveAuthorizedWalletAddress(params.address, principal);
  if (!authorizedAddress) {
    const error = getPublicError("farcasterWalletLinkUnauthorized");
    params.reply
      .status(error.statusCode)
      .send(toPublicErrorBody("farcasterWalletLinkUnauthorized"));
    return false;
  }

  try {
    const client = createPublicClient({
      chain: optimism,
      transport: http(getOptimismRpcUrl(), {
        timeout: OPTIMISM_RPC_TIMEOUT_MS,
        retryCount: OPTIMISM_RPC_RETRY_COUNT,
      }),
    });
    const onchainFid = await client.readContract({
      address: FARCASTER_ID_REGISTRY_ADDRESS,
      abi: FARCASTER_ID_REGISTRY_ABI,
      functionName: "idOf",
      args: [authorizedAddress],
    });

    if (onchainFid !== BigInt(params.fid)) {
      const error = getPublicError("farcasterWalletLinkUnauthorized");
      params.reply
        .status(error.statusCode)
        .send(toPublicErrorBody("farcasterWalletLinkUnauthorized"));
      return false;
    }
  } catch {
    const error = getPublicError("farcasterWalletLinkVerificationUnavailable");
    params.reply
      .status(error.statusCode)
      .send(toPublicErrorBody("farcasterWalletLinkVerificationUnavailable"));
    return false;
  }

  return true;
}
