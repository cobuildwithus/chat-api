import { beforeEach, describe, expect, it, vi } from "vitest";

const setupServerMock = vi.fn();
const validateEnvVariablesMock = vi.fn();
const closeCobuildDbMock = vi.fn().mockResolvedValue(undefined);
const closeRedisMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/api/server", () => ({
  setupServer: (...args: unknown[]) => setupServerMock(...args),
}));

vi.mock("../src/config/env", () => ({
  validateEnvVariables: (...args: unknown[]) => validateEnvVariablesMock(...args),
}));

vi.mock("../src/infra/db/cobuildDb", () => ({
  closeCobuildDb: (...args: unknown[]) => closeCobuildDbMock(...args),
}));

vi.mock("../src/infra/redis", () => ({
  closeRedisClient: (...args: unknown[]) => closeRedisMock(...args),
}));

describe("index", () => {
  const shutdownEvents = ["SIGTERM", "SIGINT", "uncaughtException", "unhandledRejection"] as const;

  beforeEach(() => {
    shutdownEvents.forEach((event) => process.removeAllListeners(event));
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("starts the server and logs the address", async () => {
    const listenMock = vi.fn().mockResolvedValue(undefined);
    setupServerMock.mockResolvedValue({ listen: listenMock });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    process.env.PORT = "5000";
    process.env.RAILWAY_STATIC_URL = "example.com";

    await import("../src/index");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(validateEnvVariablesMock).toHaveBeenCalled();
    expect(listenMock).toHaveBeenCalledWith({ port: 5000, host: "::" });
    expect(logSpy).toHaveBeenCalledWith("Server started at example.com:5000");

    logSpy.mockRestore();
  });

  it("uses localhost and default port when env vars are missing", async () => {
    const listenMock = vi.fn().mockResolvedValue(undefined);
    setupServerMock.mockResolvedValue({ listen: listenMock });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    delete process.env.PORT;
    delete process.env.RAILWAY_STATIC_URL;

    await import("../src/index");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listenMock).toHaveBeenCalledWith({ port: 4000, host: "::" });
    expect(logSpy).toHaveBeenCalledWith("Server started at localhost:4000");

    logSpy.mockRestore();
  });

  it("logs and exits when server startup fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(
        ((_code?: number | string | null) => undefined as never) as unknown as (
          code?: number | string | null,
        ) => never,
      );
    setupServerMock.mockRejectedValue(new Error("boom"));

    await import("../src/index");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorSpy).toHaveBeenCalledWith("Server startup failed:");
    expect(exitSpy).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("closes resources on SIGTERM", async () => {
    const listenMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    setupServerMock.mockResolvedValue({ listen: listenMock, close: closeMock });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(
        ((_code?: number | string | null) => undefined as never) as unknown as (
          code?: number | string | null,
        ) => never,
      );

    await import("../src/index");
    await new Promise((resolve) => setTimeout(resolve, 0));

    process.emit("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(closeCobuildDbMock).toHaveBeenCalledTimes(1);
    expect(closeRedisMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });

  it("exits with failure on unhandledRejection", async () => {
    const listenMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    setupServerMock.mockResolvedValue({ listen: listenMock, close: closeMock });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(
        ((_code?: number | string | null) => undefined as never) as unknown as (
          code?: number | string | null,
        ) => never,
      );

    await import("../src/index");
    await new Promise((resolve) => setTimeout(resolve, 0));

    process.emit("unhandledRejection", new Error("boom"), Promise.resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("exits with failure on uncaughtException", async () => {
    const listenMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    setupServerMock.mockResolvedValue({ listen: listenMock, close: closeMock });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(
        ((_code?: number | string | null) => undefined as never) as unknown as (
          code?: number | string | null,
        ) => never,
      );

    await import("../src/index");
    await new Promise((resolve) => setTimeout(resolve, 0));

    process.emit("uncaughtException", new Error("boom"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});
