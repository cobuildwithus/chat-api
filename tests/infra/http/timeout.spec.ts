import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeoutError, createTimeoutFetch, withTimeout } from "../../../src/infra/http/timeout";

describe("timeout helpers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it("withTimeout resolves when promise completes", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 25, "Test");
    expect(result).toBe("ok");
  });

  it("withTimeout rejects when time elapses", async () => {
    const promise = withTimeout(new Promise(() => {}), 10, "SlowOp");
    const assertion = expect(promise).rejects.toThrow(TimeoutError);
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
  });

  it("createTimeoutFetch rejects when fetch exceeds timeout", async () => {
    global.fetch = vi.fn(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;
          if (signal.aborted) {
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
            return;
          }
          signal.addEventListener(
            "abort",
            () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })),
            { once: true },
          );
        }),
    ) as unknown as typeof fetch;

    const timeoutFetch = createTimeoutFetch({ timeoutMs: 5, name: "TestFetch" });
    const promise = timeoutFetch("https://example.com");

    const assertion = expect(promise).rejects.toThrow("TestFetch request timed out");
    await vi.advanceTimersByTimeAsync(6);
    await assertion;
  });

  it("createTimeoutFetch passes through responses", async () => {
    global.fetch = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;

    const timeoutFetch = createTimeoutFetch({ timeoutMs: 50, name: "TestFetch" });
    const response = await timeoutFetch("https://example.com");
    expect(await response.text()).toBe("ok");
  });
});
