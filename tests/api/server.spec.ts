import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

type ServerMock = FastifyInstance & {
  register: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  setErrorHandler: ReturnType<typeof vi.fn>;
  server: {
    headersTimeout: number;
    requestTimeout: number;
    keepAliveTimeout: number;
    maxRequestsPerSocket: number;
    setTimeout: ReturnType<typeof vi.fn>;
  };
};

let serverMock: ServerMock;

const corsMock = vi.fn();
const requestContextMock = vi.fn();
const requestContextGetMock = vi.fn();
const registerRequestLoggingMock = vi.fn();
const rateLimitMock = vi.fn();

vi.mock("fastify", () => ({
  default: vi.fn(() => serverMock),
}));

vi.mock("@fastify/cors", () => ({
  default: corsMock,
}));

vi.mock("@fastify/rate-limit", () => ({
  default: rateLimitMock,
}));

vi.mock("@fastify/request-context", () => ({
  fastifyRequestContext: requestContextMock,
  requestContext: {
    get: (...args: unknown[]) => requestContextGetMock(...args),
  },
}));

vi.mock("../../src/api/request-logger", () => ({
  registerRequestLogging: registerRequestLoggingMock,
}));

const setupTest = async () => {
  const { setupServer } = await import("../../src/api/server");
  return setupServer();
};

describe("setupServer", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    serverMock = {
      register: vi.fn(),
      post: vi.fn(),
      get: vi.fn(),
      setErrorHandler: vi.fn(),
      server: {
        headersTimeout: 0,
        requestTimeout: 0,
        keepAliveTimeout: 0,
        maxRequestsPerSocket: 0,
        setTimeout: vi.fn(),
      },
    } as unknown as ServerMock;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("uses explicit allowed origins when configured", async () => {
    process.env.NODE_ENV = "development";
    process.env.CHAT_ALLOWED_ORIGINS = " https://a.com, https://b.com ";

    await setupTest();

    const corsCall = serverMock.register.mock.calls.find((call) => call[0] === corsMock);
    expect(corsCall?.[1]?.origin).toEqual(["https://a.com", "https://b.com"]);
    expect(registerRequestLoggingMock).toHaveBeenCalledWith(serverMock);
    expect(serverMock.post).toHaveBeenCalledTimes(2);
    expect(serverMock.get).toHaveBeenCalledTimes(3);
    expect(serverMock.setErrorHandler).toHaveBeenCalledTimes(1);
  });

  it("falls back to production defaults when env list is empty", async () => {
    process.env.NODE_ENV = "production";
    process.env.CHAT_ALLOWED_ORIGINS = " , ";

    await setupTest();

    const corsCall = serverMock.register.mock.calls.find((call) => call[0] === corsMock);
    expect(corsCall?.[1]?.origin).toEqual(["https://co.build", "https://www.co.build"]);
  });

  it("always includes production defaults when env list is provided", async () => {
    process.env.NODE_ENV = "production";
    process.env.CHAT_ALLOWED_ORIGINS = "https://extra.example, https://co.build";

    await setupTest();

    const corsCall = serverMock.register.mock.calls.find((call) => call[0] === corsMock);
    expect(corsCall?.[1]?.origin).toEqual([
      "https://co.build",
      "https://www.co.build",
      "https://extra.example",
    ]);
  });

  it("defaults to localhost origins in development", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.CHAT_ALLOWED_ORIGINS;

    await setupTest();

    const corsCall = serverMock.register.mock.calls.find((call) => call[0] === corsMock);
    expect(corsCall?.[1]?.origin).toBe("http://localhost:3000");
  });

  it("configures HTTP timeouts", async () => {
    await setupTest();

    expect(serverMock.server.headersTimeout).toBe(60_000);
    expect(serverMock.server.requestTimeout).toBe(120_000);
    expect(serverMock.server.keepAliveTimeout).toBe(5_000);
    expect(serverMock.server.maxRequestsPerSocket).toBe(1_000);
    expect(serverMock.server.setTimeout).toHaveBeenCalledWith(120_000);
  });

  it("registers rate limiting when enabled", async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_MAX = "5";
    process.env.RATE_LIMIT_WINDOW_MS = "1000";

    await setupTest();

    const rateLimitCalls = serverMock.register.mock.calls.filter((call) => call[0] === rateLimitMock);
    expect(rateLimitCalls).toHaveLength(2);
    const ipLimitCall = rateLimitCalls.find((call) => call[1]?.hook === "onRequest");
    const userLimitCall = rateLimitCalls.find((call) => call[1]?.hook === "preHandler");
    expect(ipLimitCall?.[1]?.max).toBe(15);
    expect(ipLimitCall?.[1]?.timeWindow).toBe(1000);
    expect(userLimitCall?.[1]?.max).toBe(5);
    expect(userLimitCall?.[1]?.timeWindow).toBe(1000);

    const ipKey = ipLimitCall?.[1]?.keyGenerator?.({
      headers: {},
      ip: "127.0.0.1",
    } as { headers: Record<string, string>; ip: string });
    expect(ipKey).toBe("127.0.0.1");

    requestContextGetMock.mockReturnValue({ address: "0xabc" });
    const userKey = userLimitCall?.[1]?.keyGenerator?.({
      headers: { "x-chat-user": "0xspoof" },
      ip: "127.0.0.1",
    } as { headers: Record<string, string>; ip: string });
    expect(userKey).toBe("user:0xabc");

    requestContextGetMock.mockReturnValue(undefined);
    const fallbackKey = userLimitCall?.[1]?.keyGenerator?.({
      headers: {},
      ip: "127.0.0.1",
    } as { headers: Record<string, string>; ip: string });
    expect(fallbackKey).toBe("127.0.0.1");
  });

  it("exposes source info with default url", async () => {
    delete process.env.SOURCE_CODE_URL;

    await setupTest();

    const sourceCall = serverMock.get.mock.calls.find((call) => call[0] === "/source");
    const handler = sourceCall?.[1];
    expect(typeof handler).toBe("function");

    const reply = { header: vi.fn().mockReturnThis() };
    const result = await handler?.({}, reply);

    expect(reply.header).toHaveBeenCalledWith(
      "X-Source-URL",
      "https://github.com/cobuildwithus/chat-api",
    );
    expect(result).toMatchObject({
      license: "AGPL-3.0-or-later",
      source: "https://github.com/cobuildwithus/chat-api",
    });
  });

  it("exposes source info with override url", async () => {
    process.env.SOURCE_CODE_URL = "https://example.com/source";

    await setupTest();

    const sourceCall = serverMock.get.mock.calls.find((call) => call[0] === "/source");
    const handler = sourceCall?.[1];
    expect(typeof handler).toBe("function");

    const reply = { header: vi.fn().mockReturnThis() };
    const result = await handler?.({}, reply);

    expect(reply.header).toHaveBeenCalledWith("X-Source-URL", "https://example.com/source");
    expect(result).toMatchObject({
      license: "AGPL-3.0-or-later",
      source: "https://example.com/source",
    });
  });
});
