import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { handleToolExecutionRequest, handleToolsListRequest } from "../../../src/api/tools/route";
import { createReply } from "../../utils/fastify";

const mocks = vi.hoisted(() => ({
  listToolMetadata: vi.fn(),
  executeTool: vi.fn(),
}));

vi.mock("../../../src/api/tools/registry", () => ({
  listToolMetadata: mocks.listToolMetadata,
  executeTool: mocks.executeTool,
}));

describe("tools v1 handlers", () => {
  it("returns registered tool metadata", async () => {
    mocks.listToolMetadata.mockReturnValueOnce([
      {
        name: "get-user",
        description: "desc",
        inputSchema: { type: "object" },
        scopes: ["buildbot-tools"],
        sideEffects: "read",
        version: "1.0.0",
        deprecated: false,
      },
    ]);
    const reply = createReply();

    await handleToolsListRequest({} as FastifyRequest, reply);

    expect(reply.send).toHaveBeenCalledWith({
      tools: [
        {
          name: "get-user",
          description: "desc",
          inputSchema: { type: "object" },
          scopes: ["buildbot-tools"],
          sideEffects: "read",
          version: "1.0.0",
          deprecated: false,
        },
      ],
    });
  });

  it("returns execution output and applies cache control", async () => {
    mocks.executeTool.mockResolvedValueOnce({
      ok: true,
      name: "get-user",
      output: { fid: 1 },
      cacheControl: "private, max-age=60",
    });
    const request = {
      body: {
        name: "get-user",
        input: {
          fname: "alice",
        },
      },
    } as FastifyRequest;
    const reply = createReply();

    await handleToolExecutionRequest(request, reply);

    expect(mocks.executeTool).toHaveBeenCalledWith("get-user", { fname: "alice" });
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "private, max-age=60");
    expect(reply.send).toHaveBeenCalledWith({
      ok: true,
      name: "get-user",
      output: { fid: 1 },
    });
  });

  it("returns execution errors with propagated status code", async () => {
    mocks.executeTool.mockResolvedValueOnce({
      ok: false,
      name: "unknown-tool",
      statusCode: 404,
      error: 'Unknown tool "unknown-tool".',
    });
    const request = {
      body: {
        name: "unknown-tool",
        input: {},
      },
    } as FastifyRequest;
    const reply = createReply();

    await handleToolExecutionRequest(request, reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Unknown tool "unknown-tool".',
    });
  });

  it("defaults missing input to an empty object", async () => {
    mocks.executeTool.mockResolvedValueOnce({
      ok: true,
      name: "cobuild-ai-context",
      output: { asOf: "2026-03-01T00:00:00.000Z" },
    });
    const request = {
      body: {
        name: "cobuild-ai-context",
      },
    } as FastifyRequest;
    const reply = createReply();

    await handleToolExecutionRequest(request, reply);

    expect(mocks.executeTool).toHaveBeenCalledWith("cobuild-ai-context", {});
    expect(reply.header).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith({
      ok: true,
      name: "cobuild-ai-context",
      output: { asOf: "2026-03-01T00:00:00.000Z" },
    });
  });
});
