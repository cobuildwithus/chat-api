import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUsage, recordUsage } from "../../src/infra/rate-limit";
import { getRedisClient } from "../../src/infra/redis";

const evalMock = vi.fn();
const execMock = vi.fn();
const expireMock = vi.fn(() => ({ exec: execMock }));
const zAddMock = vi.fn(() => ({ expire: expireMock }));
const multiMock = vi.fn(() => ({ zAdd: zAddMock }));

vi.mock("../../src/infra/redis", () => ({
  getRedisClient: vi.fn(),
}));

describe("rate-limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRedisClient).mockResolvedValue({
      eval: evalMock,
      multi: multiMock,
    } as any);
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
    expect(zAddMock).toHaveBeenCalledWith("key", expect.any(Object));
    expect(expireMock).toHaveBeenCalledWith("key", 86400);
    expect(execMock).toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
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
});
