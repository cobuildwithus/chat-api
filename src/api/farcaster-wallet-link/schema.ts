import { cliToolsAuthHeadersJsonSchema, normalizeEvmAddress } from "@cobuild/wire";
import { z } from "zod";
import {
  buildFastifyRouteSchema,
  createRuntimeSchemaParser,
} from "../zod-route-schema";

const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/;

const farcasterWalletLinkBodySchema = z.object({
  fid: z.coerce.number().int().positive().safe(),
  address: z.string().trim().regex(evmAddressPattern, "address must be a valid EVM address."),
}).strict();

const farcasterWalletLinkBodySchemaParser = createRuntimeSchemaParser(
  farcasterWalletLinkBodySchema,
);

export const farcasterWalletLinkSchema = {
  ...buildFastifyRouteSchema({
    body: farcasterWalletLinkBodySchemaParser,
  }),
  headers: cliToolsAuthHeadersJsonSchema,
};

export type FarcasterWalletLinkBody = {
  fid: number;
  address: `0x${string}`;
};

export function parseFarcasterWalletLinkBody(input: unknown): FarcasterWalletLinkBody {
  const parsed = farcasterWalletLinkBodySchemaParser.parse(input);
  return {
    fid: parsed.fid,
    address: normalizeEvmAddress(parsed.address, "address"),
  };
}
