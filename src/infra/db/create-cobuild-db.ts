import { withReplicas } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { DatabaseConfig } from "../../config/env";
import { getPostgresPoolOptions, getPostgresPoolStatsIntervalMs } from "../../config/env";
import * as schema from "./schema";

type CobuildDbResources = {
  db: ReturnType<typeof withReplicas>;
  close: () => Promise<void>;
};

const logPoolError = (label: string, error: unknown) => {
  console.error(`[db] ${label} pool error`, error);
};

const createPool = (
  label: string,
  connectionString: string,
  options: ReturnType<typeof getPostgresPoolOptions>,
  statsIntervalMs: number | null,
  readOnly = false,
): Pool => {
  const pool = new Pool({ connectionString, ...options });
  pool.on("error", (error) => logPoolError(label, error));
  if (statsIntervalMs && statsIntervalMs > 0 && process.env.NODE_ENV !== "test") {
    const interval = setInterval(() => {
      console.info(`[db] ${label} pool stats`, {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      });
    }, statsIntervalMs);
    interval.unref?.();
  }
  if (readOnly) {
    pool.on("connect", (client) => {
      void client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    });
  }
  return pool;
};

const closePools = async (label: string, pools: Pool[]): Promise<void> => {
  await Promise.all(
    pools.map(async (pool) => {
      try {
        await pool.end();
      } catch (error) {
        console.error(`[db] failed to close ${label} pool`, error);
      }
    }),
  );
};

export function createCobuildDbResources({ primaryUrl, replicaUrls }: DatabaseConfig): CobuildDbResources {
  const poolOptions = getPostgresPoolOptions();
  const statsIntervalMs = getPostgresPoolStatsIntervalMs();
  const primaryPool = createPool("primary", primaryUrl, poolOptions, statsIntervalMs);
  const replicaPools = replicaUrls.map((connectionString) =>
    createPool("replica", connectionString, poolOptions, statsIntervalMs, true),
  );

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
  const db = withReplicas(primaryDb, replicasForReads);
  const close = async () => {
    await Promise.all([closePools("replica", replicaPools), closePools("primary", [primaryPool])]);
  };
  return { db, close };
}

export function bootstrapCobuildDb(config: DatabaseConfig) {
  return createCobuildDbResources(config).db;
}
