import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { digestOAuthSecret } from "../../src/api/oauth/security";

type ServerMock = FastifyInstance & {
  register: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
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

const getPreHandlerKeyGenerator = async () => {
  process.env.RATE_LIMIT_ENABLED = "true";
  process.env.RATE_LIMIT_MAX = "5";
  process.env.RATE_LIMIT_WINDOW_MS = "1000";

  await setupTest();

  const rateLimitCalls = serverMock.register.mock.calls.filter((call) => call[0] === rateLimitMock);
  const userLimitCall = rateLimitCalls.find((call) => call[1]?.hook === "preHandler");
  expect(userLimitCall?.[1]?.keyGenerator).toBeTypeOf("function");
  return userLimitCall?.[1]?.keyGenerator as (request: {
    headers: Record<string, string>;
    ip: string;
    routerPath?: string;
    url?: string;
  }) => string;
};

describe("setupServer rate-limit keying order", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = "test";
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;

    serverMock = {
      register: vi.fn(),
      post: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
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

  it("prefers toolsPrincipal over bearer-token and user keys", async () => {
    const keyGenerator = await getPreHandlerKeyGenerator();

    requestContextGetMock.mockImplementation((key: string) => {
      if (key === "toolsPrincipal") {
        return {
          ownerAddress: "0x0000000000000000000000000000000000000001",
          agentKey: "default",
          sessionId: "42",
        };
      }
      if (key === "user") {
        return { address: "0xabc" };
      }
      return undefined;
    });

    expect(
      keyGenerator({
        headers: { authorization: "Bearer bbt_should_not_win" },
        ip: "127.0.0.1",
        routerPath: "/v1/tool-executions",
        url: "/v1/tool-executions",
      }),
    ).toBe("tools:0x0000000000000000000000000000000000000001:default:42");
  });

  it("uses hashed tools token before user on tools routes, and user on non-tools routes", async () => {
    const keyGenerator = await getPreHandlerKeyGenerator();

    requestContextGetMock.mockImplementation((key: string) => {
      if (key === "user") {
        return { address: "0xabc" };
      }
      return undefined;
    });

    const token = "bbt_example";
    const expectedTokenHash = digestOAuthSecret(token);

    expect(
      keyGenerator({
        headers: { authorization: `Bearer ${token}` },
        ip: "127.0.0.1",
        routerPath: "/v1/tools",
        url: "/v1/tools",
      }),
    ).toBe(`tools-token:${expectedTokenHash}`);

    expect(
      keyGenerator({
        headers: { authorization: `Bearer ${token}` },
        ip: "127.0.0.1",
        routerPath: "/api/chat",
        url: "/api/chat",
      }),
    ).toBe("user:0xabc");
  });
});
