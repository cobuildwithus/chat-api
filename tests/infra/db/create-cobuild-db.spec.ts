import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapCobuildDb, createCobuildDbResources } from "../../../src/infra/db/create-cobuild-db";

const { poolInstances, PoolMock, drizzleMock, withReplicasMock } = vi.hoisted(() => {
  type PoolInstance = {
    connectionString: string;
    on: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  const poolInstances: PoolInstance[] = [];
  const PoolMock = vi.fn().mockImplementation((opts: { connectionString: string }) => {
    const pool: PoolInstance = {
      connectionString: opts.connectionString,
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
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
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.POSTGRES_POOL_MAX;
    delete process.env.POSTGRES_POOL_IDLE_TIMEOUT_MS;
    delete process.env.POSTGRES_POOL_CONNECTION_TIMEOUT_MS;
    delete process.env.POSTGRES_POOL_STATS_INTERVAL_MS;
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

  it("applies pool options and registers error handlers", () => {
    process.env.POSTGRES_POOL_MAX = "20";
    process.env.POSTGRES_POOL_IDLE_TIMEOUT_MS = "5000";
    process.env.POSTGRES_POOL_CONNECTION_TIMEOUT_MS = "2000";
    const primaryDb = { id: "primary" };
    drizzleMock.mockReturnValueOnce(primaryDb);

    bootstrapCobuildDb({ primaryUrl: "pg://primary", replicaUrls: [] });

    expect(PoolMock).toHaveBeenCalledWith({
      connectionString: "pg://primary",
      max: 20,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 2000,
    });
    expect(poolInstances[0]?.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(poolInstances[0]?.on).toHaveBeenCalledWith("connect", expect.any(Function));
  });

  it("registers replica read-only handlers and pool stats when enabled", () => {
    process.env.NODE_ENV = "production";
    process.env.POSTGRES_POOL_STATS_INTERVAL_MS = "1000";
    const unrefMocks: Array<ReturnType<typeof vi.fn>> = [];
    const setIntervalSpy = vi
      .spyOn(global, "setInterval")
      .mockImplementation((() => {
        const unref = vi.fn();
        unrefMocks.push(unref);
        return { unref } as unknown as NodeJS.Timeout;
      }) as typeof setInterval);
    const primaryDb = { id: "primary" };
    const replicaDb = { id: "replica" };
    drizzleMock.mockReturnValueOnce(primaryDb).mockReturnValueOnce(replicaDb);

    createCobuildDbResources({
      primaryUrl: "pg://primary",
      replicaUrls: ["pg://replica"],
    });

    expect(poolInstances[1]?.on).toHaveBeenCalledWith("connect", expect.any(Function));
    expect(poolInstances[0]?.on).toHaveBeenCalledWith("connect", expect.any(Function));
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    unrefMocks.forEach((mock) => expect(mock).toHaveBeenCalledTimes(1));
    setIntervalSpy.mockRestore();
  });

  it("applies session timeouts on connect", () => {
    const primaryDb = { id: "primary" };
    drizzleMock.mockReturnValueOnce(primaryDb);

    bootstrapCobuildDb({ primaryUrl: "pg://primary", replicaUrls: [] });

    const connectHandler = poolInstances[0]?.on.mock.calls.find(
      ([event]) => event === "connect",
    )?.[1];
    const query = vi.fn();
    connectHandler?.({ query });

    expect(query).toHaveBeenCalledWith("SET statement_timeout = '10000ms'");
    expect(query).toHaveBeenCalledWith("SET lock_timeout = '2000ms'");
    expect(query).toHaveBeenCalledWith("SET idle_in_transaction_session_timeout = '60000ms'");
  });

  it("applies read-only and session settings for replica pools", () => {
    const primaryDb = { id: "primary" };
    const replicaDb = { id: "replica" };
    drizzleMock.mockReturnValueOnce(primaryDb).mockReturnValueOnce(replicaDb);

    createCobuildDbResources({
      primaryUrl: "pg://primary",
      replicaUrls: ["pg://replica"],
    });

    const connectHandler = poolInstances[1]?.on.mock.calls.find(
      ([event]) => event === "connect",
    )?.[1];
    const query = vi.fn();
    connectHandler?.({ query });

    expect(query).toHaveBeenCalledWith("SET statement_timeout = '10000ms'");
    expect(query).toHaveBeenCalledWith("SET lock_timeout = '2000ms'");
    expect(query).toHaveBeenCalledWith("SET idle_in_transaction_session_timeout = '60000ms'");
    expect(query).toHaveBeenCalledWith("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  });

  it("throws when replica drizzle returns undefined", () => {
    const primaryDb = { id: "primary" };
    drizzleMock.mockReturnValueOnce(primaryDb).mockReturnValueOnce(undefined);

    expect(() =>
      bootstrapCobuildDb({ primaryUrl: "pg://primary", replicaUrls: ["pg://replica"] }),
    ).toThrow("Expected at least one replica instance");
  });

  it("closes pools when requested", async () => {
    const primaryDb = { id: "primary" };
    const replicaDb = { id: "replica" };
    drizzleMock.mockReturnValueOnce(primaryDb).mockReturnValueOnce(replicaDb);

    const resources = createCobuildDbResources({
      primaryUrl: "pg://primary",
      replicaUrls: ["pg://replica"],
    });

    await resources.close();

    expect(poolInstances[0]?.end).toHaveBeenCalledTimes(1);
    expect(poolInstances[1]?.end).toHaveBeenCalledTimes(1);
  });

  it("logs errors when pools fail to close", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const primaryDb = { id: "primary" };
    drizzleMock.mockReturnValueOnce(primaryDb);

    const resources = createCobuildDbResources({
      primaryUrl: "pg://primary",
      replicaUrls: [],
    });
    poolInstances[0]?.end.mockRejectedValueOnce(new Error("close failed"));

    await resources.close();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to close"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});
