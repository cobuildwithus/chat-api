import { describe, expect, it, vi } from "vitest";

const NeynarAPIClientMock = vi.fn();

vi.mock("@neynar/nodejs-sdk", () => ({
  NeynarAPIClient: NeynarAPIClientMock,
}));

describe("neynar client", () => {
  it("throws when api key is missing", async () => {
    vi.resetModules();
    delete process.env.NEYNAR_API_KEY_NOTIFICATIONS;

    await expect(import("../../src/infra/neynar/client")).rejects.toThrow(
      "NEYNAR_API_KEY_NOTIFICATIONS is not set",
    );
  });

  it("creates a client when api key is provided", async () => {
    vi.resetModules();
    process.env.NEYNAR_API_KEY_NOTIFICATIONS = "key";

    const module = await import("../../src/infra/neynar/client");
    expect(module.neynarClientNotifications).toBeDefined();
    expect(NeynarAPIClientMock).toHaveBeenCalledWith({ apiKey: "key" });
  });
});
