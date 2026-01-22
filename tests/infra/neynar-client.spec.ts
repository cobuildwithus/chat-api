import { beforeEach, describe, expect, it, vi } from "vitest";

const NeynarAPIClientMock = vi.fn();

vi.mock("@neynar/nodejs-sdk", () => ({
  NeynarAPIClient: NeynarAPIClientMock,
}));

describe("neynar client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when api key is missing", async () => {
    vi.resetModules();
    delete process.env.NEYNAR_API_KEY;
    const module = await import("../../src/infra/neynar/client");
    expect(module.getNeynarClient()).toBeNull();
  });

  it("creates a client when api key is provided", async () => {
    vi.resetModules();
    process.env.NEYNAR_API_KEY = "key";

    const module = await import("../../src/infra/neynar/client");
    expect(module.getNeynarClient()).toBeDefined();
    expect(NeynarAPIClientMock).toHaveBeenCalledWith({ apiKey: "key" });
  });

  it("caches the client", async () => {
    vi.resetModules();
    process.env.NEYNAR_API_KEY = "key";

    const module = await import("../../src/infra/neynar/client");
    const first = module.getNeynarClient();
    const second = module.getNeynarClient();
    expect(first).toBe(second);
    expect(NeynarAPIClientMock).toHaveBeenCalledTimes(1);
  });
});
