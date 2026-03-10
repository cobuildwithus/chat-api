import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkAndRecordUsage,
  getUsage,
  recordUsage,
  removeRecordedUsage,
} from "../../src/infra/rate-limit";
import { getRedisClient } from "../../src/infra/redis";

const evalMock = vi.fn();
const execMock = vi.fn();
const zRemMock = vi.fn();
const expireMock = vi.fn(() => ({ exec: execMock }));
const zAddMock = vi.fn(() => ({ expire: expireMock }));
const multiMock = vi.fn(() => ({ zAdd: zAddMock }));

vi.mock("../../src/infra/redis", () => ({
  getRedisClient: vi.fn(),
}));

describe("rate-limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const redisClient = {
      eval: evalMock,
      multi: multiMock,
      zRem: zRemMock,
    } as unknown as Awaited<ReturnType<typeof getRedisClient>>;
    vi.mocked(getRedisClient).mockResolvedValue(redisClient);
  });

  it("gets usage and logs in non-production", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    process.env.NODE_ENV = "development";
    evalMock.mockResolvedValueOnce(5);

    const usage = await getUsage("key", 1);
    expect(usage).toBe(5);
    expect(evalMock).toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
  });

  it("records usage with a ttl", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    process.env.NODE_ENV = "development";

    await recordUsage("key", 10);
    expect(multiMock).toHaveBeenCalled();
    expect(zAddMock).toHaveBeenCalledWith(
      "key",
      expect.objectContaining({
        score: expect.any(Number),
        value: expect.stringMatching(/^10\|\d+\|\d+$/),
      }),
    );
    expect(expireMock).toHaveBeenCalledWith("key", 86400);
    expect(execMock).toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
  });

  it("records unique usage members even when timestamp is identical", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.111111)
      .mockReturnValueOnce(0.222222);

    await recordUsage("key", 1);
    await recordUsage("key", 1);

    const firstCall = zAddMock.mock.calls[0] as unknown as
      | [string, { score: number; value: string }]
      | undefined;
    const secondCall = zAddMock.mock.calls[1] as unknown as
      | [string, { score: number; value: string }]
      | undefined;
    const firstValue = firstCall?.[1]?.value;
    const secondValue = secondCall?.[1]?.value;
    expect(firstValue).toMatch(/^1\|1700000000000\|\d+$/);
    expect(secondValue).toMatch(/^1\|1700000000000\|\d+$/);
    expect(secondValue).not.toBe(firstValue);

    randomSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it("throws when redis errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    evalMock.mockRejectedValueOnce(new Error("boom"));

    await expect(getUsage("key", 1)).rejects.toThrow("boom");
    errorSpy.mockRestore();
  });

  it("throws when record usage fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    execMock.mockRejectedValueOnce(new Error("fail"));

    await expect(recordUsage("key", 10)).rejects.toThrow("fail");
    errorSpy.mockRestore();
  });

  it("checks and records usage atomically", async () => {
    evalMock.mockResolvedValueOnce([1, 7, 0]);

    const result = await checkAndRecordUsage("key", {
      windowMinutes: 1,
      maxUsage: 10,
      usageToAdd: 2,
      nowMs: 1234,
    });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: true,
        usage: 7,
        retryAfterSeconds: 0,
      }),
    );
    expect(evalMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        keys: ["key"],
        arguments: expect.arrayContaining(["1234", "60000", "10", "2", "86400"]),
      }),
    );
    const args = evalMock.mock.calls[0]?.[1]?.arguments as string[];
    expect(args?.[5]).toMatch(/^2\|1234\|\d+$/);
  });

  it("returns retry-after when atomic check blocks usage", async () => {
    evalMock.mockResolvedValueOnce([0, 10, 2500]);

    const result = await checkAndRecordUsage("key", {
      windowMinutes: 1,
      maxUsage: 10,
      usageToAdd: 1,
    });

    expect(result).toEqual({
      allowed: false,
      usage: 10,
      retryAfterSeconds: 3,
    });
  });

  it("parses string usage entries from lua responses", async () => {
    evalMock.mockResolvedValueOnce(["1", "12|1700000000000|42", "abc"]);

    const result = await checkAndRecordUsage("key", {
      windowMinutes: 1,
      maxUsage: 50,
      usageToAdd: 1,
    });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: true,
        usage: 12,
        retryAfterSeconds: 0,
      }),
    );
  });

  it("falls back safely when lua response fields are non-numeric", async () => {
    evalMock.mockResolvedValueOnce(["0", {}, null]);

    const result = await checkAndRecordUsage("key", {
      windowMinutes: 1,
      maxUsage: 10,
      usageToAdd: 1,
    });

    expect(result).toEqual({
      allowed: false,
      usage: 0,
      retryAfterSeconds: 1,
    });
  });

  it("throws when atomic check fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    evalMock.mockRejectedValueOnce(new Error("atomic fail"));

    await expect(
      checkAndRecordUsage("key", {
        windowMinutes: 1,
        maxUsage: 10,
        usageToAdd: 1,
      }),
    ).rejects.toThrow("atomic fail");

    errorSpy.mockRestore();
  });

  it("removes a recorded usage member", async () => {
    await removeRecordedUsage("key", "1000|request-1");

    expect(zRemMock).toHaveBeenCalledWith("key", "1000|request-1");
  });
});
