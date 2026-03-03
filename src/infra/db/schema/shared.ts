import { customType, pgSchema } from "drizzle-orm/pg-core";

export const cobuildSchema = pgSchema("cobuild");
export const farcasterSchema = pgSchema("farcaster");
export const onchainSchema = pgSchema("cobuild-onchain");

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
