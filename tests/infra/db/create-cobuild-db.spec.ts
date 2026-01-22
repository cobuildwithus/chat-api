import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapCobuildDb } from "../../../src/infra/db/create-cobuild-db";

const { poolInstances, PoolMock, drizzleMock, withReplicasMock } = vi.hoisted(() => {
  type PoolInstance = { connectionString: string; on: ReturnType<typeof vi.fn> };
  const poolInstances: PoolInstance[] = [];
  const PoolMock = vi.fn().mockImplementation((opts: { connectionString: string }) => {
    const pool: PoolInstance = {
      connectionString: opts.connectionString,
      on: vi.fn(),
    };
    poolInstances.push(pool);
    return pool;
  });

  const drizzleMock = vi.fn();
  const withReplicasMock = vi.fn((primary: unknown, replicas: unknown[]) => ({
    primary,
    replicas,
  }));

  return { poolInstances, PoolMock, drizzleMock, withReplicasMock };
});

vi.mock("pg", () => ({
  Pool: PoolMock,
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: (pool: unknown, options: unknown) => drizzleMock(pool, options),
}));

vi.mock("drizzle-orm/pg-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/pg-core")>();
  return {
    ...actual,
    withReplicas: (primary: unknown, replicas: unknown[]) => withReplicasMock(primary, replicas),
  };
});

describe("bootstrapCobuildDb", () => {
  beforeEach(() => {
    poolInstances.length = 0;
    vi.clearAllMocks();
  });

  it("returns primary db when no replicas provided", () => {
    const primaryDb = { id: "primary" };
    drizzleMock.mockReturnValueOnce(primaryDb);

    const result = bootstrapCobuildDb({ primaryUrl: "pg://primary", replicaUrls: [] });

    expect(PoolMock).toHaveBeenCalledWith({ connectionString: "pg://primary" });
    expect(withReplicasMock).toHaveBeenCalledWith(primaryDb, [primaryDb]);
    expect(result).toEqual({ primary: primaryDb, replicas: [primaryDb] });
  });

  it("uses replica pools when provided", () => {
    const primaryDb = { id: "primary" };
    const replicaDb = { id: "replica" };
    drizzleMock.mockReturnValueOnce(primaryDb).mockReturnValueOnce(replicaDb);

    const result = bootstrapCobuildDb({
      primaryUrl: "pg://primary",
      replicaUrls: ["pg://replica"],
    });

    expect(PoolMock).toHaveBeenCalledWith({ connectionString: "pg://primary" });
    expect(PoolMock).toHaveBeenCalledWith({ connectionString: "pg://replica" });
    expect(result).toEqual({ primary: primaryDb, replicas: [replicaDb] });
  });

  it("throws when replica drizzle returns undefined", () => {
    const primaryDb = { id: "primary" };
    drizzleMock.mockReturnValueOnce(primaryDb).mockReturnValueOnce(undefined);

    expect(() =>
      bootstrapCobuildDb({ primaryUrl: "pg://primary", replicaUrls: ["pg://replica"] }),
    ).toThrow("Expected at least one replica instance");
  });
});
