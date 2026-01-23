import { beforeEach, describe, expect, it, vi } from "vitest";

describe("cobuildDb", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock("../../../src/infra/db/cobuildDb");
    vi.doMock("../../../src/config/env", () => ({
      loadDatabaseConfig: vi.fn(() => ({ primaryUrl: "pg://primary", replicaUrls: [] })),
    }));
    vi.doMock("../../../src/infra/db/create-cobuild-db", () => ({
      createCobuildDbResources: vi.fn(() => ({ db: { id: "db" }, close: vi.fn() })),
    }));
  });

  it("boots cobuild db using config", async () => {
    const module = await import("../../../src/infra/db/cobuildDb");
    expect(module.cobuildDb).toEqual({ id: "db" });
    expect(module.closeCobuildDb).toBeTypeOf("function");
  });
});
