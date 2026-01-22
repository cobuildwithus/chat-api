import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserAddressFromToken } from "../../../src/api/auth/get-user-from-token";
import { importSPKI, jwtVerify } from "jose";

vi.mock("jose", () => ({
  importSPKI: vi.fn(),
  jwtVerify: vi.fn(),
}));

const importSPKIMock = vi.mocked(importSPKI);
const jwtVerifyMock = vi.mocked(jwtVerify);

describe("getUserAddressFromToken", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.PRIVY_APP_ID = "privy";
    process.env.PRIVY_VERIFICATION_KEY = "test-key";
    importSPKIMock.mockResolvedValue("key" as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns the wallet linked account address", async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: "user",
        linked_accounts: JSON.stringify([
          { type: "email", address: "user@example.com" },
          { type: "wallet", address: "0xAbC" },
        ]),
      },
    } as any);

    const result = await getUserAddressFromToken("token");
    expect(result).toBe("0xabc");
  });

  it("returns undefined when verification fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    jwtVerifyMock.mockRejectedValue(new Error("bad token"));

    const result = await getUserAddressFromToken("token");
    expect(result).toBeUndefined();
    consoleSpy.mockRestore();
  });

  it("throws when PRIVY_VERIFICATION_KEY is missing", async () => {
    delete process.env.PRIVY_VERIFICATION_KEY;
    await expect(getUserAddressFromToken("token")).rejects.toThrow(
      "Missing PRIVY_VERIFICATION_KEY",
    );
  });
});
