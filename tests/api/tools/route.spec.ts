import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleToolExecutionRequest,
  handleToolMetadataRequest,
  handleToolsListRequest,
} from "../../../src/api/tools/route";
import { createReply } from "../../utils/fastify";

const mocks = vi.hoisted(() => ({
  listToolMetadata: vi.fn(),
  resolveToolMetadata: vi.fn(),
  resolveToolInputSchema: vi.fn(),
  executeTool: vi.fn(),
}));

vi.mock("../../../src/tools/registry", () => ({
  listToolMetadata: mocks.listToolMetadata,
  resolveToolMetadata: mocks.resolveToolMetadata,
  resolveToolInputSchema: mocks.resolveToolInputSchema,
  executeTool: mocks.executeTool,
}));

describe("tools v1 handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns registered tool metadata", async () => {
    mocks.listToolMetadata.mockReturnValueOnce([
      {
        name: "get-user",
        description: "desc",
        inputSchema: { type: "object" },
        scopes: ["cli-tools"],
        authPolicy: { requiredScopes: ["tools:read"], walletBinding: "none" },
        exposure: "chat-safe",
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
          scopes: ["cli-tools"],
          authPolicy: { requiredScopes: ["tools:read"], walletBinding: "none" },
          exposure: "chat-safe",
          sideEffects: "read",
          version: "1.0.0",
          deprecated: false,
        },
      ],
    });
  });

  it("returns tool metadata for canonical names and aliases", async () => {
    mocks.resolveToolMetadata.mockReturnValueOnce({
      name: "docs-search",
      description: "desc",
      inputSchema: { type: "object" },
      scopes: ["docs"],
      authPolicy: { requiredScopes: ["tools:read"], walletBinding: "none" },
      exposure: "bearer-only",
      sideEffects: "network-read",
      version: "1.0.0",
      deprecated: false,
      aliases: ["docs.search"],
    });
    const request = {
      params: {
        name: "docs.search",
      },
    } as FastifyRequest;
    const reply = createReply();

    await handleToolMetadataRequest(request, reply);

    expect(mocks.resolveToolMetadata).toHaveBeenCalledWith("docs.search");
    expect(reply.send).toHaveBeenCalledWith({
      tool: {
        name: "docs-search",
        description: "desc",
        inputSchema: { type: "object" },
        scopes: ["docs"],
        authPolicy: { requiredScopes: ["tools:read"], walletBinding: "none" },
        exposure: "bearer-only",
        sideEffects: "network-read",
        version: "1.0.0",
        deprecated: false,
        aliases: ["docs.search"],
      },
    });
  });

  it("returns 404 when tool metadata is not found", async () => {
    mocks.resolveToolMetadata.mockReturnValueOnce(null);
    const request = {
      params: {
        name: "unknown-tool",
      },
    } as FastifyRequest;
    const reply = createReply();

    await handleToolMetadataRequest(request, reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Unknown tool "unknown-tool".',
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
      ok: false,
      name: "unknown-tool",
      statusCode: 404,
      error: 'Unknown tool "unknown-tool".',
    });
  });

  it("defaults missing input to an empty object", async () => {
    mocks.executeTool.mockResolvedValueOnce({
      ok: true,
      name: "get-treasury-stats",
      output: { asOf: "2026-03-01T00:00:00.000Z" },
    });
    const request = {
      body: {
        name: "get-treasury-stats",
      },
    } as FastifyRequest;
    const reply = createReply();

    await handleToolExecutionRequest(request, reply);

    expect(mocks.executeTool).toHaveBeenCalledWith("get-treasury-stats", {});
    expect(reply.header).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith({
      ok: true,
      name: "get-treasury-stats",
      output: { asOf: "2026-03-01T00:00:00.000Z" },
    });
  });

  it("propagates tool authorization failures", async () => {
    mocks.executeTool.mockResolvedValueOnce({
      ok: false,
      name: "list-wallet-notifications",
      statusCode: 403,
      error: "This token does not have notifications:read scope for the requested tool.",
    });
    const request = {
      body: {
        name: "list-wallet-notifications",
        input: {},
      },
    } as FastifyRequest;
    const reply = createReply();

    await handleToolExecutionRequest(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      ok: false,
      name: "list-wallet-notifications",
      statusCode: 403,
      error: "This token does not have notifications:read scope for the requested tool.",
    });
  });

  it("passes through subject-wallet tool success responses", async () => {
    mocks.executeTool.mockResolvedValueOnce({
      ok: true,
      name: "list-wallet-notifications",
      output: { items: [] },
      cacheControl: "no-store",
    });
    const request = {
      body: {
        name: "list-wallet-notifications",
        input: {},
      },
    } as FastifyRequest;
    const reply = createReply();

    await handleToolExecutionRequest(request, reply);

    expect(mocks.executeTool).toHaveBeenCalledWith("list-wallet-notifications", {});
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.send).toHaveBeenCalledWith({
      ok: true,
      name: "list-wallet-notifications",
      output: { items: [] },
    });
  });
});
