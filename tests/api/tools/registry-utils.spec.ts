import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asNumber,
  asString,
  isFeatureEnabled,
  isRecord,
  normalizeHttpUrl,
  toIsoString,
} from "../../../src/tools/registry/utils";

const walletModuleMocks = vi.hoisted(() => ({
  listWalletNotifications: vi.fn(),
  getToolsPrincipalFromContext: vi.fn(),
  getOrSetCachedResultWithLock: vi.fn(),
  createPublicClient: vi.fn(),
}));

vi.mock("../../../src/domains/notifications/service", async () => {
  const actual = await vi.importActual<typeof import("../../../src/domains/notifications/service")>(
    "../../../src/domains/notifications/service",
  );
  return {
    ...actual,
    listWalletNotifications: walletModuleMocks.listWalletNotifications,
  };
});

vi.mock("../../../src/domains/notifications/wallet-subject", async () => {
  const actual = await vi.importActual<typeof import("../../../src/domains/notifications/wallet-subject")>(
    "../../../src/domains/notifications/wallet-subject",
  );
  return {
    ...actual,
    getToolsPrincipalFromContext: walletModuleMocks.getToolsPrincipalFromContext,
  };
});

vi.mock("../../../src/infra/cache/cacheResult", () => ({
  getOrSetCachedResultWithLock: walletModuleMocks.getOrSetCachedResultWithLock,
}));

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: walletModuleMocks.createPublicClient,
  };
});

describe("tool registry utils", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("checks plain record values only", () => {
    expect(isRecord({ ok: true })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
  });

  it("normalizes strings and numbers from mixed inputs", () => {
    expect(asString("  hello  ")).toBe("hello");
    expect(asString("   ")).toBeNull();
    expect(asString(3)).toBeNull();

    expect(asNumber(12)).toBe(12);
    expect(asNumber(" 42 ")).toBe(42);
    expect(asNumber("")).toBeNull();
    expect(asNumber("nope")).toBeNull();
  });

  it("parses feature flags with defaults and unknown values", () => {
    process.env = {
      ...originalEnv,
      FEATURE_ALPHA: "yes",
      FEATURE_BETA: "off",
      FEATURE_GAMMA: "maybe",
    };

    expect(isFeatureEnabled("FEATURE_ALPHA", false)).toBe(true);
    expect(isFeatureEnabled("FEATURE_BETA", true)).toBe(false);
    expect(isFeatureEnabled("FEATURE_GAMMA", true)).toBe(true);
    expect(isFeatureEnabled("FEATURE_MISSING", false)).toBe(false);
  });

  it("normalizes only http and https urls", () => {
    expect(normalizeHttpUrl("https://example.com/docs")).toBe("https://example.com/docs");
    expect(normalizeHttpUrl("ftp://example.com/file")).toBeNull();
    expect(normalizeHttpUrl("not a url")).toBeNull();
  });

  it("serializes valid dates and rejects invalid values", () => {
    expect(toIsoString(new Date("2026-03-01T00:00:00.000Z"))).toBe("2026-03-01T00:00:00.000Z");
    expect(toIsoString("2026-03-02T00:00:00.000Z")).toBe("2026-03-02T00:00:00.000Z");
    expect(toIsoString("bad-date")).toBeNull();
    expect(toIsoString(null)).toBeNull();
  });
});

describe("split wallet registry definitions", () => {
  it("maps subject-wallet notification errors through the wallet tool definition", async () => {
    const { WalletNotificationsSubjectRequiredError } = await import(
      "../../../src/domains/notifications/service"
    );
    const { walletToolDefinitions } = await import("../../../src/tools/registry/wallet");
    const listNotificationsTool = walletToolDefinitions.find(
      (tool) => tool.name === "list-wallet-notifications",
    );

    walletModuleMocks.listWalletNotifications.mockRejectedValueOnce(
      new WalletNotificationsSubjectRequiredError(),
    );

    expect(listNotificationsTool).toBeTruthy();
    const result = await listNotificationsTool!.execute({
      limit: 20,
      unreadOnly: false,
    });

    expect(result).toEqual({
      ok: false,
      name: "list-wallet-notifications",
      statusCode: 401,
      error: "Authenticated subject wallet is required to list wallet notifications.",
    });
  });
});
