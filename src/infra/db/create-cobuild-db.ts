import { withReplicas } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { DatabaseConfig } from "../../config/env";
import * as schema from "./schema";

export function bootstrapCobuildDb({ primaryUrl, replicaUrls }: DatabaseConfig) {
  const primaryPool = new Pool({ connectionString: primaryUrl });

  const replicaPools = replicaUrls.map((connectionString) => {
    const pool = new Pool({ connectionString });
    pool.on("connect", (client) => {
      void client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    });
    return pool;
  });

  const primaryDb = drizzle(primaryPool, { schema });
  type CobuildDbInstance = typeof primaryDb;
  const replicaDbs = replicaPools.map((pool) => drizzle(pool, { schema }));

  const toTuple = (replicas: CobuildDbInstance[]): [CobuildDbInstance, ...CobuildDbInstance[]] => {
    const [first, ...rest] = replicas;
    if (!first) {
      throw new Error("Expected at least one replica instance");
    }
    return [first, ...rest];
  };

  const replicasForReads =
    replicaDbs.length > 0 ? toTuple(replicaDbs) : ([primaryDb] as [CobuildDbInstance, ...CobuildDbInstance[]]);
  return withReplicas(primaryDb, replicasForReads);
}
