import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
const onMock = vi.fn();
const setMock = vi.fn();
const evalMock = vi.fn();

type RedisClientMock = {
  connect: typeof connectMock;
  on: typeof onMock;
  set: typeof setMock;
  eval: typeof evalMock;
};

const client: RedisClientMock = {
  connect: connectMock,
  on: onMock,
  set: setMock,
  eval: evalMock,
};

vi.mock("redis", () => ({
  createClient: vi.fn(() => client),
}));

describe("redis helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("caches the redis client connection", async () => {
    connectMock.mockResolvedValue(client);

    const { getRedisClient } = await import("../../src/infra/redis");
    const first = await getRedisClient();
    const second = await getRedisClient();

    expect(first).toBe(client);
    expect(second).toBe(client);
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it("retries connection after failure", async () => {
    connectMock.mockRejectedValueOnce(new Error("fail"));
    connectMock.mockResolvedValueOnce(client);

    const { getRedisClient } = await import("../../src/infra/redis");
    await expect(getRedisClient()).rejects.toThrow("fail");
    await expect(getRedisClient()).resolves.toBe(client);
    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it("acquires and releases a lock", async () => {
    connectMock.mockResolvedValue(client);
    setMock.mockResolvedValue("OK");

    const { withRedisLock } = await import("../../src/infra/redis");

    const result = await withRedisLock("lock-key", async () => "done", { ttlMs: 1000 });
    expect(result).toBe("done");
    expect(setMock).toHaveBeenCalled();
    expect(evalMock).toHaveBeenCalled();
  });

  it("times out when lock cannot be acquired", async () => {
    vi.useFakeTimers();
    connectMock.mockResolvedValue(client);
    setMock.mockResolvedValue(null);

    const { withRedisLock } = await import("../../src/infra/redis");

    const promise = withRedisLock("lock-timeout", async () => "done", {
      maxWaitMs: 50,
      retryMinMs: 10,
      retryMaxMs: 10,
      ttlMs: 10,
    });

    const expectation = expect(promise).rejects.toThrow("NonceLockTimeout:lock-timeout");
    await vi.advanceTimersByTimeAsync(60);
    await expectation;
    vi.useRealTimers();
  });

  it("ignores release errors", async () => {
    connectMock.mockResolvedValue(client);
    setMock.mockResolvedValue("OK");
    evalMock.mockRejectedValueOnce(new Error("release"));

    const { withRedisLock } = await import("../../src/infra/redis");

    await expect(withRedisLock("lock-release", async () => "done")).resolves.toBe("done");
  });
});
