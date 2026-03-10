import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

async function loadRegistryBackedTool(options?: {
  executeToolResult?: unknown;
  exposure?: "chat-safe" | "bearer-only" | null;
  inputSchema?: ReturnType<typeof z.object> | null;
}) {
  vi.resetModules();

  const executeTool = vi.fn();
  if (options && "executeToolResult" in options) {
    executeTool.mockResolvedValue(options.executeToolResult);
  }

  vi.doMock("../../../src/tools/registry", () => ({
    executeTool,
    resolveToolExposure: vi.fn(() => (options && "exposure" in options ? options.exposure : "chat-safe")),
    resolveToolInputSchema: vi.fn(() => (
      options && "inputSchema" in options
        ? options.inputSchema
        : z.object({
            foo: z.string(),
          })
    )),
  }));

  const module = await import("../../../src/ai/tools/registry-backed-tool");
  return {
    executeTool,
    registryBackedTool: module.registryBackedTool,
  };
}

afterEach(() => {
  vi.doUnmock("../../../src/tools/registry");
  vi.resetModules();
});

describe("registryBackedTool helper", () => {
  it("throws when the registry tool exposure is unknown", async () => {
    const { registryBackedTool } = await loadRegistryBackedTool({ exposure: null });
    expect(() =>
      registryBackedTool({
        registryName: "missing-tool",
        description: "missing",
      }),
    ).toThrow('Unknown registry-backed AI tool "missing-tool".');
  });

  it("throws when the registry tool is not chat-safe", async () => {
    const { registryBackedTool } = await loadRegistryBackedTool({ exposure: "bearer-only" });
    expect(() =>
      registryBackedTool({
        registryName: "get-wallet-balances",
        description: "should stay bearer-only",
      }),
    ).toThrow('Registry-backed AI tool "get-wallet-balances" must be explicitly marked chat-safe.');
  });

  it("throws when the registry input schema is missing", async () => {
    const { registryBackedTool } = await loadRegistryBackedTool({ inputSchema: null });
    expect(() =>
      registryBackedTool({
        registryName: "get-goal",
        description: "missing schema",
      }),
    ).toThrow('Unknown registry-backed AI tool "get-goal".');
  });

  it("returns canonical successful outputs", async () => {
    const { registryBackedTool, executeTool } = await loadRegistryBackedTool({
      executeToolResult: {
        ok: true,
        name: "test-tool",
        output: { ok: true },
      },
    });

    const wrappedTool = registryBackedTool({
      registryName: "test-tool",
      description: "test",
    });

    const result = await wrappedTool.execute!(
      { foo: "bar" },
      { toolCallId: "tool", messages: [] },
    );

    expect(result).toEqual({ ok: true });
    expect(executeTool).toHaveBeenCalledWith("test-tool", { foo: "bar" });
  });

  it("returns canonical structured errors", async () => {
    const { registryBackedTool, executeTool } = await loadRegistryBackedTool({
      executeToolResult: {
        ok: false,
        name: "test-tool",
        statusCode: 400,
        error: "bad input",
      },
    });

    const wrappedTool = registryBackedTool({
      registryName: "test-tool",
      description: "test",
    });

    const result = await wrappedTool.execute!(
      { foo: "bar" },
      { toolCallId: "tool", messages: [] },
    );

    expect(result).toEqual({ error: "bad input" });
    expect(executeTool).toHaveBeenCalledWith("test-tool", { foo: "bar" });
  });
});
