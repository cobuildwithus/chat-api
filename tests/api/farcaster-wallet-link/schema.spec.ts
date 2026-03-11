import { describe, expect, it } from "vitest";
import { cliToolsAuthHeadersJsonSchema } from "@cobuild/wire";
import {
  farcasterWalletLinkSchema,
  parseFarcasterWalletLinkBody,
} from "../../../src/api/farcaster-wallet-link/schema";

describe("farcaster wallet-link schema", () => {
  it("requires CLI bearer auth headers", () => {
    expect(farcasterWalletLinkSchema.headers).toEqual(cliToolsAuthHeadersJsonSchema);
  });

  it("parses the wallet-link body with strict runtime validation", () => {
    expect(
      parseFarcasterWalletLinkBody({
        fid: "123",
        address: " 0x0000000000000000000000000000000000000001 ",
      }),
    ).toEqual({
      fid: 123,
      address: "0x0000000000000000000000000000000000000001",
    });

    expect(() =>
      parseFarcasterWalletLinkBody({
        fid: 123,
      }),
    ).toThrow();
    expect(() =>
      parseFarcasterWalletLinkBody({
        fid: 123,
        address: "0x0000000000000000000000000000000000000001",
        extra: true,
      }),
    ).toThrow();
    expect(() =>
      parseFarcasterWalletLinkBody({
        fid: 123,
        address: "not-an-address",
      }),
    ).toThrow();
  });
});
