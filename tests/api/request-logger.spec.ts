import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { registerRequestLogging } from "../../src/api/request-logger";
import { requestContext } from "@fastify/request-context";

vi.mock("@fastify/request-context", () => ({
  requestContext: {
    set: vi.fn(),
    get: vi.fn(),
  },
}));

describe("registerRequestLogging", () => {
  const originalEnv = process.env;
  type HookFn = (...args: unknown[]) => void;
  type HookedServer = { addHook: (name: string, fn: HookFn) => void };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("skips hook registration when debug is disabled", () => {
    delete process.env.DEBUG_HTTP;

    const server: HookedServer = { addHook: vi.fn() };
    registerRequestLogging(server as unknown as FastifyInstance);

    expect(server.addHook).not.toHaveBeenCalled();
  });

  it("registers hooks and logs request lifecycle when debug enabled", () => {
    process.env.DEBUG_HTTP = "true";

    const hooks: Record<string, HookFn> = {};
    const server: HookedServer = {
      addHook: vi.fn((name: string, fn: HookFn) => {
        hooks[name] = fn;
      }),
    };

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    registerRequestLogging(server as unknown as FastifyInstance);

    expect(server.addHook).toHaveBeenCalledTimes(4);

    const done = vi.fn();
    hooks.onRequest(
      {
        id: "req-1",
        method: "POST",
        url: "/api/chat",
        ip: "127.0.0.1",
        headers: { "user-agent": "agent" },
      },
      {},
      done,
    );

    expect(requestContext.set).toHaveBeenCalledWith("requestStartMs", expect.any(Number));
    expect(infoSpy).toHaveBeenCalledWith("[req]", expect.any(Object));
    expect(done).toHaveBeenCalled();

    hooks.preHandler(
      {
        id: "req-1",
        method: "POST",
        url: "/api/chat",
        body: {
          type: "chat-default",
          id: "chat-1",
          messages: [{ id: "m1" }],
          data: { goalAddress: "0xabc" },
        },
      },
      {},
      done,
    );

    expect(infoSpy).toHaveBeenCalledWith("[req-body]", expect.any(Object));

    const logCount = infoSpy.mock.calls.length;
    hooks.preHandler(
      {
        id: "req-2",
        method: "POST",
        url: "/api/chat",
        body: "invalid",
      },
      {},
      done,
    );
    expect(infoSpy.mock.calls.length).toBe(logCount);

    hooks.preHandler({ method: "GET" }, {}, done);

    vi.mocked(requestContext.get).mockReturnValue(1000);
    hooks.onResponse(
      { id: "req-1", method: "POST", url: "/api/chat" },
      { statusCode: 200 },
      done,
    );
    expect(infoSpy).toHaveBeenCalledWith("[res]", expect.any(Object));

    hooks.onError(
      { id: "req-1", method: "POST", url: "/api/chat" },
      { statusCode: 500 },
      new Error("boom"),
      done,
    );
    expect(errorSpy).toHaveBeenCalledWith("[err]", expect.any(Object));

    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
