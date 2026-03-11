import { normalizeEvmAddress } from "@cobuild/wire";
import { and, eq } from "drizzle-orm";
import { cobuildPrimaryDb } from "../../cobuildDb";
import { cliAgentWallets } from "../../schema";

type ReadHostedCliWalletAddressParams = {
  ownerAddress: `0x${string}`;
  agentKey: string;
};

export async function readHostedCliWalletAddress(
  params: ReadHostedCliWalletAddressParams,
): Promise<`0x${string}` | null> {
  const rows = await cobuildPrimaryDb()
    .select({ address: cliAgentWallets.address })
    .from(cliAgentWallets)
    .where(
      and(
        eq(cliAgentWallets.ownerAddress, params.ownerAddress),
        eq(cliAgentWallets.agentKey, params.agentKey),
      ),
    )
    .limit(1);

  const address = rows[0]?.address;
  if (!address) {
    return null;
  }

  return normalizeEvmAddress(address, "cliAgentWallets.address");
}
