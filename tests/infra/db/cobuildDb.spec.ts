import { beforeEach, describe, expect, it, vi } from "vitest";

describe("cobuildDb", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock("../../../src/infra/db/cobuildDb");
    vi.doMock("../../../src/config/env", () => ({
      loadDatabaseConfig: vi.fn(() => ({ primaryUrl: "pg://primary", replicaUrls: [] })),
    }));
    vi.doMock("../../../src/infra/db/create-cobuild-db", () => ({
      bootstrapCobuildDb: vi.fn(() => ({ id: "db" })),
    }));
  });

  it("boots cobuild db using config", async () => {
    const module = await import("../../../src/infra/db/cobuildDb");
    expect(module.cobuildDb).toEqual({ id: "db" });
  });
});
