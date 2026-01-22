import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

type ServerMock = FastifyInstance & {
  register: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  setErrorHandler: ReturnType<typeof vi.fn>;
};

let serverMock: ServerMock;

const corsMock = vi.fn();
const requestContextMock = vi.fn();
const registerRequestLoggingMock = vi.fn();

vi.mock("fastify", () => ({
  default: vi.fn(() => serverMock),
}));

vi.mock("@fastify/cors", () => ({
  default: corsMock,
}));

vi.mock("@fastify/request-context", () => ({
  fastifyRequestContext: requestContextMock,
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
    serverMock = {
      register: vi.fn(),
      post: vi.fn(),
      get: vi.fn(),
      setErrorHandler: vi.fn(),
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
    expect(serverMock.get).toHaveBeenCalledTimes(2);
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
});
