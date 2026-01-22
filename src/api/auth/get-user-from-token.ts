import * as jose from "jose";
import { getPrivyAppId, getPrivyVerificationKey } from "../../config/env";

export async function getUserAddressFromToken(token: string) {
  const verificationKey = getPrivyVerificationKey();
  if (!verificationKey) {
    throw new Error("Missing PRIVY_VERIFICATION_KEY");
  }

  try {
    const { payload } = await jose.jwtVerify(
      token,
      await jose.importSPKI(verificationKey, "ES256"),
      { issuer: "privy.io", audience: getPrivyAppId() },
    );

    if (!payload || !payload.sub || !payload.linked_accounts) return undefined;

    const linkedAccounts = JSON.parse(payload.linked_accounts as string) as {
      type: string;
      address: string;
    }[];

    const walletAccount = linkedAccounts.find(
      (account) =>
        account &&
        typeof account.address === "string" &&
        (account.type === "wallet" || account.type === "ethereum"),
    );

    if (!walletAccount) return undefined;

    return walletAccount.address.toLowerCase();
  } catch (error) {
    console.error(error);
    return undefined;
  }
}
