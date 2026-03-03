import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "../../../src/tools/registry";

const mocks = vi.hoisted(() => ({
  getOrSetCachedResultWithLock: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  createTimeoutFetch: vi.fn(),
  getCobuildAiContextSnapshot: vi.fn(),
  getOpenAiTimeoutMs: vi.fn(),
  createPublicClient: vi.fn(),
  requestContextGet: vi.fn(),
}));

vi.mock("../../../src/config/env", () => ({
  getOpenAiTimeoutMs: mocks.getOpenAiTimeoutMs,
}));

vi.mock("../../../src/infra/cache/cacheResult", () => ({
  getOrSetCachedResultWithLock: mocks.getOrSetCachedResultWithLock,
}));

vi.mock("../../../src/infra/db/cobuildDb", () => ({
  cobuildDb: {
    select: mocks.select,
    execute: mocks.execute,
  },
}));

vi.mock("../../../src/infra/http/timeout", () => ({
  createTimeoutFetch: mocks.createTimeoutFetch,
}));

vi.mock("../../../src/infra/cobuild-ai-context", async () => {
  const actual = await vi.importActual<typeof import("../../../src/infra/cobuild-ai-context")>(
    "../../../src/infra/cobuild-ai-context",
  );
  return {
    ...actual,
    getCobuildAiContextSnapshot: mocks.getCobuildAiContextSnapshot,
  };
});

vi.mock("@fastify/request-context", () => ({
  requestContext: {
    get: (...args: unknown[]) => mocks.requestContextGet(...args),
  },
}));

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: mocks.createPublicClient,
  };
});

function makeSelectChain(rows: unknown[]) {
  const chain = {
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: (input: unknown[]) => unknown) => Promise.resolve(resolve(rows)),
  };
  return chain;
}

function queueSelectRows(...rowsQueue: unknown[][]) {
  let index = 0;
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => makeSelectChain(rowsQueue[index++] ?? []),
    }),
  }));
}

function embeddingPayload() {
  return {
    data: [
      {
        embedding: Array.from({ length: 256 }, (_, i) => i / 256),
      },
    ],
  };
}

describe("tool registry execution", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();

    mocks.getOpenAiTimeoutMs.mockReturnValue(1_000);
    mocks.requestContextGet.mockReturnValue(undefined);
    mocks.getOrSetCachedResultWithLock.mockImplementation(
      async (_key: string, _prefix: string, fetchFn: () => Promise<unknown>) => await fetchFn(),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("executes get-user exact match", async () => {
    queueSelectRows([
      {
        fid: 123,
        fname: "alice",
        verifiedAddresses: ["0xabc"],
      },
    ]);

    const result = await executeTool("get-user", { fname: "alice" });

    expect(result).toMatchObject({
      ok: true,
      name: "get-user",
      output: {
        fid: 123,
        fname: "alice",
        addresses: ["0xabc"],
      },
      cacheControl: "private, max-age=60",
    });
  });

  it("executes get-user fuzzy fallback when exact lookup misses", async () => {
    queueSelectRows(
      [],
      [
        {
          fid: 321,
          fname: "alice-builder",
        },
      ],
    );

    const result = await executeTool("get-user", { fname: "ali" });

    expect(result).toMatchObject({
      ok: true,
      output: {
        usedLikeQuery: true,
        users: [{ fid: 321, fname: "alice-builder" }],
      },
    });
  });

  it("returns empty get-user results without fuzzy fallback for very short misses", async () => {
    queueSelectRows([]);

    const result = await executeTool("get-user", { fname: "al" });

    expect(result).toMatchObject({
      ok: true,
      output: {
        usedLikeQuery: false,
        users: [],
      },
    });
  });

  it("normalizes get-user lookups to lowercase before exact matching", async () => {
    queueSelectRows([
      {
        fid: 123,
        fname: "alice",
        verifiedAddresses: ["0xabc"],
      },
    ]);

    const result = await executeTool("get-user", { fname: "ALICE" });

    expect(mocks.getOrSetCachedResultWithLock).toHaveBeenCalledWith(
      "alice",
      expect.any(String),
      expect.any(Function),
      expect.any(Number),
    );
    expect(result).toMatchObject({
      ok: true,
      name: "get-user",
      output: {
        fid: 123,
        fname: "alice",
        addresses: ["0xabc"],
      },
    });
  });

  it("executes get-cast and normalizes alias names", async () => {
    mocks.execute.mockResolvedValueOnce({
      rows: [
        {
          hashHex: "a".repeat(40),
          parentHashHex: "b".repeat(40),
          rootHashHex: "a".repeat(40),
          rootParentUrl: "https://farcaster.xyz/~/channel/cobuild",
          text: "hello world",
          castTimestamp: "2026-03-02T00:00:00.000Z",
          replyCount: 2,
          viewCount: 9,
          authorFid: 123,
          authorFname: "alice",
          authorDisplayName: "Alice",
          authorAvatarUrl: "https://example.com/a.png",
          authorNeynarScore: 0.8,
        },
      ],
    });

    const result = await executeTool("cli.get-cast", {
      identifier: `0x${"A".repeat(40)}`,
      type: "hash",
    });

    expect(result).toMatchObject({
      ok: true,
      name: "get-cast",
      output: {
        hash: `0x${"a".repeat(40)}`,
        parentHash: `0x${"b".repeat(40)}`,
        text: "hello world",
        authorUsername: "alice",
      },
    });
  });

  it("executes cast-preview with optional fields", async () => {
    const result = await executeTool("cast-preview", {
      text: "  hello  ",
      embeds: [{ url: "https://example.com/1.png" }],
      parent: "0xparent",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        text: "hello",
        embeds: [{ url: "https://example.com/1.png" }],
        parent: "0xparent",
      },
      cacheControl: "no-store",
    });
  });

  it("executes get-treasury-stats and handles success", async () => {
    mocks.getCobuildAiContextSnapshot.mockResolvedValue({
      data: { asOf: "2026-03-02T00:00:00.000Z" },
      error: null,
    });

    const result = await executeTool("get-treasury-stats", {});

    expect(result).toMatchObject({
      ok: true,
      output: { asOf: "2026-03-02T00:00:00.000Z" },
      cacheControl: "public, max-age=60",
    });
  });

  it("executes get-wallet-balances with short-term cache", async () => {
    const getBalance = vi.fn().mockResolvedValue(1_250_000_000_000_000_000n);
    const readContract = vi.fn().mockResolvedValue(2_500_000n);
    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x00000000000000000000000000000000000000aA",
      agentKey: "default",
    });
    mocks.createPublicClient.mockReturnValue({
      getBalance,
      readContract,
    });

    const result = await executeTool("get-wallet-balances", { network: "base" });

    expect(result).toEqual({
      ok: true,
      name: "get-wallet-balances",
      output: {
        agentKey: "default",
        network: "base",
        walletAddress: "0x00000000000000000000000000000000000000aa",
        balances: {
          eth: {
            wei: "1250000000000000000",
            formatted: "1.25",
          },
          usdc: {
            raw: "2500000",
            decimals: 6,
            formatted: "2.5",
            contract: "0x833589fCD6EDB6E08F4C7C32D4F71B54BDA02913",
          },
        },
      },
      cacheControl: "private, max-age=60",
    });
    expect(mocks.getOrSetCachedResultWithLock).toHaveBeenCalledWith(
      "base:0x00000000000000000000000000000000000000aa",
      "cli-tools:get-wallet-balances:",
      expect.any(Function),
      30,
    );
    expect(getBalance).toHaveBeenCalledWith({
      address: "0x00000000000000000000000000000000000000aa",
    });
    expect(readContract).toHaveBeenCalledWith({
      address: "0x833589fCD6EDB6E08F4C7C32D4F71B54BDA02913",
      abi: expect.any(Array),
      functionName: "balanceOf",
      args: ["0x00000000000000000000000000000000000000aa"],
    });
  });

  it("returns request-scoped agentKey even when wallet balances are cached", async () => {
    const getBalance = vi.fn().mockResolvedValue(1_250_000_000_000_000_000n);
    const readContract = vi.fn().mockResolvedValue(2_500_000n);
    const cache = new Map<string, unknown>();
    mocks.createPublicClient.mockReturnValue({
      getBalance,
      readContract,
    });
    mocks.getOrSetCachedResultWithLock.mockImplementation(
      async (key: string, prefix: string, fetchFn: () => Promise<unknown>) => {
        const cacheKey = `${prefix}${key}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey);
        const value = await fetchFn();
        cache.set(cacheKey, value);
        return value;
      },
    );

    mocks.requestContextGet
      .mockReturnValueOnce({
        ownerAddress: "0x00000000000000000000000000000000000000aA",
        agentKey: "default",
      })
      .mockReturnValueOnce({
        ownerAddress: "0x00000000000000000000000000000000000000aA",
        agentKey: "ops",
      });

    const first = await executeTool("get-wallet-balances", { network: "base" });
    const second = await executeTool("get-wallet-balances", { network: "base" });

    expect(first).toMatchObject({
      ok: true,
      name: "get-wallet-balances",
      output: {
        agentKey: "default",
      },
    });
    expect(second).toMatchObject({
      ok: true,
      name: "get-wallet-balances",
      output: {
        agentKey: "ops",
      },
    });
    expect(getBalance).toHaveBeenCalledTimes(1);
    expect(readContract).toHaveBeenCalledTimes(1);
  });

  it("executes docs-search and parses results from both payload formats", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.DOCS_VECTOR_STORE_ID = "vs_123";

    const timeoutFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                file_id: "file_data_1",
                filename: "data.md",
                score: 0.81,
                text: "From data array",
                attributes: {
                  slug: "/docs/data",
                  path: "docs/data",
                },
              },
              {
                file_id: "file_data_2",
                filename: "empty-snippet.md",
                score: 0.5,
                content: [{}],
                attributes: {
                  path: "docs/empty",
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: [
              {
                type: "file_search_call",
                results: [
                  {
                    file_id: "file_output_1",
                    filename: "output.md",
                    score: 0.93,
                    content: [{ text: "From output results" }],
                    attributes: {
                      slug: "docs/output",
                      path: "docs/output",
                    },
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      );
    mocks.createTimeoutFetch.mockReturnValue(timeoutFetch);

    const first = await executeTool("docs-search", { query: "bridge", limit: 2 });
    const second = await executeTool("docs.search", { query: "governance", limit: 2 });

    expect(first).toMatchObject({
      ok: true,
      name: "docs-search",
      output: {
        query: "bridge",
        count: 2,
        results: [
          {
            fileId: "file_data_1",
            filename: "data.md",
            url: "https://docs.co.build/docs/data",
            snippet: "From data array",
          },
          {
            fileId: "file_data_2",
            filename: "empty-snippet.md",
            url: null,
            snippet: null,
          },
        ],
      },
    });
    expect(second).toMatchObject({
      ok: true,
      name: "docs-search",
      output: {
        query: "governance",
        count: 1,
        results: [
          {
            fileId: "file_output_1",
            filename: "output.md",
            url: "https://docs.co.build/docs/output",
            snippet: "From output results",
          },
        ],
      },
    });
  });

  it("executes list-discussions with sorting and pagination", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        {
          hashHex: "1".repeat(40),
          text: "hello world from top-level post",
          castTimestamp: "2026-03-01T00:00:00.000Z",
          replyCount: "2",
          viewCount: "11",
          lastReplyTimestamp: "2026-03-01T01:00:00.000Z",
          lastReplyAuthorFname: "bob",
          authorFid: 123,
          authorFname: "alice",
          authorDisplayName: "Alice",
          authorAvatarUrl: "https://example.com/pfp.png",
          authorNeynarScore: 0.8,
        },
        {
          hashHex: "2".repeat(40),
          text: "second row to trigger hasMore",
          castTimestamp: "2026-03-01T00:30:00.000Z",
          replyCount: "1",
          viewCount: "4",
          lastReplyTimestamp: null,
          lastReplyAuthorFname: null,
          authorFid: 222,
          authorFname: "carol",
          authorDisplayName: "Carol",
          authorAvatarUrl: null,
          authorNeynarScore: 0.7,
        },
      ],
    });

    const result = await executeTool("list-discussions", {
      limit: 1,
      offset: 0,
      sort: "views",
      direction: "asc",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        hasMore: true,
        limit: 1,
        offset: 0,
        sort: "views",
        direction: "asc",
        items: [
          {
            hash: `0x${"1".repeat(40)}`,
            title: "hello world from top-level post",
            authorUsername: "alice",
            replyCount: 2,
            viewCount: 11,
            author: {
              fid: 123,
              username: "alice",
            },
          },
        ],
      },
    });
  });

  it("maps list-discussions rows without last reply metadata", async () => {
    mocks.execute.mockResolvedValueOnce({
      rows: [
        {
          hashHex: "2".repeat(40),
          text: "post without replies",
          castTimestamp: "2026-03-01T00:00:00.000Z",
          replyCount: "0",
          viewCount: "5",
          lastReplyTimestamp: null,
          lastReplyAuthorFname: null,
          authorFid: 123,
          authorFname: "alice",
          authorDisplayName: "Alice",
          authorAvatarUrl: null,
          authorNeynarScore: 0.91,
        },
      ],
    });

    const result = await executeTool("list-discussions", {});

    expect(result).toMatchObject({
      ok: true,
      output: {
        items: [
          {
            hash: `0x${"2".repeat(40)}`,
            lastReply: null,
          },
        ],
      },
    });
  });

  it("executes list-discussions with replies sort branch", async () => {
    mocks.execute.mockResolvedValueOnce({
      rows: [],
    });

    const result = await executeTool("list-discussions", {
      sort: "replies",
      direction: "desc",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        sort: "replies",
        direction: "desc",
      },
    });
  });

  it("executes get-discussion-thread with focus pagination", async () => {
    const rootHash = `0x${"3".repeat(40)}`;
    const focusHash = `0x${"8".repeat(40)}`;
    mocks.execute
      .mockResolvedValueOnce({
        rows: [
          {
            hashHex: "3".repeat(40),
            parentHashHex: null,
            text: "root post",
            castTimestamp: "2026-03-01T00:00:00.000Z",
            viewCount: "10",
            authorFid: 1,
            authorFname: "rooter",
            authorDisplayName: "Root",
            authorAvatarUrl: null,
            authorNeynarScore: 0.9,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ count: "3" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            focusTimestamp: "2026-03-01T02:00:00.000Z",
            focusHashHex: "8".repeat(40),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ count: "2" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            hashHex: "8".repeat(40),
            parentHashHex: "3".repeat(40),
            text: "focused reply",
            castTimestamp: "2026-03-01T02:00:00.000Z",
            viewCount: "1",
            authorFid: 4,
            authorFname: "dave",
            authorDisplayName: "Dave",
            authorAvatarUrl: null,
            authorNeynarScore: 0.8,
          },
        ],
      });

    const result = await executeTool("get-discussion-thread", {
      rootHash,
      page: 1,
      pageSize: 2,
      focusHash,
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        root: {
          hash: rootHash,
          text: "root post",
          authorUsername: "rooter",
        },
        page: 2,
        pageSize: 2,
        totalPages: 2,
        hasNextPage: false,
        hasPrevPage: true,
        focusHash,
        replies: [
          {
            hash: focusHash,
            parentHash: rootHash,
            text: "focused reply",
            authorUsername: "dave",
          },
        ],
      },
    });
  });

  it("executes semantic-search-casts and maps embedding/vector results", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const rootHash = `0x${"a".repeat(40)}`;
    const timeoutFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(embeddingPayload()), {
          status: 200,
        }),
      );
    mocks.createTimeoutFetch.mockReturnValue(timeoutFetch);
    mocks.execute.mockResolvedValue({
      rows: [
        {
          hashHex: "b".repeat(40),
          parentHashHex: "a".repeat(40),
          rootHashHex: "a".repeat(40),
          text: "semantic result",
          castTimestamp: "2026-03-01T03:00:00.000Z",
          distance: 0.2,
          authorFid: 101,
          authorFname: "eve",
          authorDisplayName: "Eve",
          authorAvatarUrl: null,
          authorNeynarScore: 0.78,
        },
      ],
    });

    const result = await executeTool("semantic-search-casts", {
      query: "build ecosystem",
      limit: 5,
      rootHash,
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        query: "build ecosystem",
        count: 1,
        rootHash,
        items: [
          {
            hash: `0x${"b".repeat(40)}`,
            parentHash: rootHash,
            rootHash,
            authorUsername: "eve",
            similarity: 0.8,
          },
        ],
      },
      cacheControl: "private, max-age=60",
    });
  });

  it("returns a 400 when tool name is empty after trim", async () => {
    const result = await executeTool("   ", {});
    expect(result).toEqual({
      ok: false,
      name: "",
      statusCode: 400,
      error: "Tool name must not be empty.",
    });
  });

  it("covers get-user validation and failure branches", async () => {
    const missing = await executeTool("get-user", {});
    expect(missing).toEqual({
      ok: false,
      name: "get-user",
      statusCode: 400,
      error: "fname must be a string.",
    });

    const blank = await executeTool("get-user", { fname: "   " });
    expect(blank).toEqual({
      ok: false,
      name: "get-user",
      statusCode: 400,
      error: "fname must not be empty.",
    });

    mocks.getOrSetCachedResultWithLock.mockRejectedValueOnce(new Error("db down"));
    const failure = await executeTool("get-user", { fname: "alice" });
    expect(failure).toEqual({
      ok: false,
      name: "get-user",
      statusCode: 502,
      error: "get-user request failed: db down",
    });
  });

  it("covers get-cast validation and upstream failure branches", async () => {
    process.env.ENABLE_CLI_GET_CAST = "false";
    expect(await executeTool("get-cast", { identifier: "x", type: "hash" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 403,
      error: "This tool is disabled.",
    });
    delete process.env.ENABLE_CLI_GET_CAST;

    expect(await executeTool("get-cast", {})).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 400,
      error: "identifier must be a string.",
    });

    expect(await executeTool("get-cast", { identifier: "   ", type: "hash" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 400,
      error: "identifier must not be empty.",
    });

    expect(await executeTool("get-cast", { identifier: "x", type: "nope" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 400,
      error: 'type must be either "hash" or "url".',
    });

    expect(await executeTool("get-cast", { identifier: "https://warpcast.com/alice/0xabc", type: "url" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 400,
      error: "URL lookup is no longer supported. Provide a full cast hash (0x + 40 hex chars).",
    });

    expect(await executeTool("get-cast", { identifier: "x", type: "hash" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 400,
      error: "identifier must be a full cast hash (0x + 40 hex chars).",
    });

    const missingHash = `0x${"1".repeat(40)}`;
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    expect(await executeTool("get-cast", { identifier: missingHash, type: "hash" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 404,
      error: "Cast not found.",
    });

    mocks.execute.mockRejectedValueOnce(new Error("db fail"));
    expect(await executeTool("get-cast", { identifier: missingHash, type: "hash" })).toEqual({
      ok: false,
      name: "get-cast",
      statusCode: 502,
      error: "get-cast request failed: db fail",
    });
  });

  it("covers cast-preview validation branches", async () => {
    expect(await executeTool("cast-preview", {})).toEqual({
      ok: false,
      name: "cast-preview",
      statusCode: 400,
      error: "text must be a string.",
    });

    expect(await executeTool("cast-preview", { text: "   " })).toEqual({
      ok: false,
      name: "cast-preview",
      statusCode: 400,
      error: "text must not be empty.",
    });
  });

  it("covers get-treasury-stats error branches", async () => {
    mocks.getCobuildAiContextSnapshot.mockResolvedValueOnce({
      data: null,
      error: "upstream unavailable",
    });
    expect(await executeTool("get-treasury-stats", {})).toEqual({
      ok: false,
      name: "get-treasury-stats",
      statusCode: 502,
      error: "get-treasury-stats request failed: upstream unavailable",
    });

    mocks.getCobuildAiContextSnapshot.mockRejectedValueOnce(new Error("boom"));
    expect(await executeTool("get-treasury-stats", {})).toEqual({
      ok: false,
      name: "get-treasury-stats",
      statusCode: 502,
      error: "get-treasury-stats request failed: boom",
    });
  });

  it("covers get-wallet-balances validation and auth branches", async () => {
    expect(await executeTool("get-wallet-balances", { network: "mainnet" })).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 400,
      error: 'network must be either "base" or "base-sepolia".',
    });

    expect(await executeTool("get-wallet-balances", { agentKey: "  " })).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 400,
      error: "agentKey must not be empty.",
    });

    mocks.requestContextGet.mockReturnValue(undefined);
    expect(await executeTool("get-wallet-balances", {})).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 401,
      error: "Authenticated tools principal is required to fetch wallet balances.",
    });

    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
    });
    expect(await executeTool("get-wallet-balances", { agentKey: "ops" })).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 403,
      error: 'agentKey mismatch for this token. Expected "default".',
    });
  });

  it("executes get-wallet-balances on base-sepolia and accepts matching explicit agent", async () => {
    const getBalance = vi.fn().mockResolvedValue(10000000000000000n);
    const readContract = vi.fn().mockResolvedValue(500000n);
    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "ops",
    });
    mocks.createPublicClient.mockReturnValue({
      getBalance,
      readContract,
    });

    const result = await executeTool("get-wallet-balances", {
      network: "base-sepolia",
      agentKey: "ops",
    });

    expect(result).toMatchObject({
      ok: true,
      name: "get-wallet-balances",
      output: {
        agentKey: "ops",
        network: "base-sepolia",
      },
    });
    expect(readContract).toHaveBeenCalledWith({
      address: "0x036CbD53842c5426634e7929541eC2318f3dCf7e",
      abi: expect.any(Array),
      functionName: "balanceOf",
      args: ["0x0000000000000000000000000000000000000001"],
    });
  });

  it("returns 500 when tools principal owner address is invalid", async () => {
    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "not-an-address",
      agentKey: "default",
    });

    expect(await executeTool("get-wallet-balances", {})).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 500,
      error: "Authenticated tools principal has an invalid owner address.",
    });
  });

  it("returns 401 when tools principal context access throws", async () => {
    mocks.requestContextGet.mockImplementation(() => {
      throw new Error("context unavailable");
    });

    expect(await executeTool("get-wallet-balances", {})).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 401,
      error: "Authenticated tools principal is required to fetch wallet balances.",
    });
  });

  it("returns 502 when balance fetch fails upstream", async () => {
    mocks.requestContextGet.mockReturnValue({
      ownerAddress: "0x0000000000000000000000000000000000000001",
      agentKey: "default",
    });
    mocks.getOrSetCachedResultWithLock.mockRejectedValueOnce(new Error("rpc unavailable"));

    expect(await executeTool("get-wallet-balances", {})).toEqual({
      ok: false,
      name: "get-wallet-balances",
      statusCode: 502,
      error: "get-wallet-balances request failed: rpc unavailable",
    });
  });

  it("covers docs-search validation and upstream error branches", async () => {
    process.env.ENABLE_CLI_DOCS_SEARCH = "false";
    expect(await executeTool("docs-search", { query: "x" })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 403,
      error: "This tool is disabled.",
    });
    delete process.env.ENABLE_CLI_DOCS_SEARCH;

    delete process.env.DOCS_VECTOR_STORE_ID;
    delete process.env.OPENAI_API_KEY;

    expect(await executeTool("docs-search", { query: "x" })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 503,
      error: "Docs search is not configured (missing DOCS_VECTOR_STORE_ID).",
    });

    process.env.DOCS_VECTOR_STORE_ID = "vs_123";
    expect(await executeTool("docs-search", { query: "x" })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 503,
      error: "Docs search is not configured (missing OPENAI_API_KEY).",
    });

    process.env.OPENAI_API_KEY = "key";
    expect(await executeTool("docs-search", {})).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 400,
      error: "Query must be a string.",
    });
    expect(await executeTool("docs-search", { query: "   " })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 400,
      error: "Query must not be empty.",
    });
    expect(await executeTool("docs-search", { query: "x".repeat(1001) })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 400,
      error: "Query must be at most 1000 characters.",
    });
    expect(await executeTool("docs-search", { query: "x", limit: "nope" })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 400,
      error: "Limit must be an integer.",
    });
    expect(await executeTool("docs-search", { query: "x", limit: 25 })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 400,
      error: "Limit must be between 1 and 20.",
    });

    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })),
    );
    expect(await executeTool("docs-search", { query: "x", limit: 2 })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 502,
      error: "Docs search request failed: OpenAI vector store search request failed with status 500",
    });

    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(new Response("{not-json", { status: 200 })),
    );
    expect(await executeTool("docs-search", { query: "x", limit: 2 })).toEqual({
      ok: false,
      name: "docs-search",
      statusCode: 502,
      error: "Docs search request failed: OpenAI vector store search returned invalid JSON.",
    });
  });

  it("covers list-discussions parse and failure branches", async () => {
    expect(await executeTool("list-discussions", { offset: "bad" })).toEqual({
      ok: false,
      name: "list-discussions",
      statusCode: 400,
      error: "offset must be an integer.",
    });
    expect(await executeTool("list-discussions", { offset: 10001 })).toEqual({
      ok: false,
      name: "list-discussions",
      statusCode: 400,
      error: "offset must be between 0 and 10000.",
    });

    mocks.execute.mockRejectedValueOnce(new Error("db timeout"));
    expect(await executeTool("list-discussions", {})).toEqual({
      ok: false,
      name: "list-discussions",
      statusCode: 502,
      error: "list-discussions request failed: db timeout",
    });
  });

  it("covers get-discussion-thread validation and not-found branches", async () => {
    const rootHash = `0x${"a".repeat(40)}`;

    expect(await executeTool("get-discussion-thread", {})).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "rootHash must be a full cast hash (0x + 40 hex chars).",
    });
    expect(await executeTool("get-discussion-thread", { rootHash, page: "x" })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "page must be an integer.",
    });
    expect(await executeTool("get-discussion-thread", { rootHash, page: 0 })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "page must be between 1 and 10000.",
    });
    expect(await executeTool("get-discussion-thread", { rootHash, pageSize: "x" })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "pageSize must be an integer.",
    });
    expect(await executeTool("get-discussion-thread", { rootHash, pageSize: 101 })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "pageSize must be between 1 and 100.",
    });
    expect(await executeTool("get-discussion-thread", { rootHash, focusHash: "bad" })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 400,
      error: "focusHash must be a full cast hash (0x + 40 hex chars).",
    });

    mocks.execute.mockResolvedValueOnce({ rows: [] });
    expect(await executeTool("get-discussion-thread", { rootHash })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 404,
      error: "Discussion thread not found.",
    });

    mocks.execute.mockRejectedValueOnce(new Error("db fail"));
    expect(await executeTool("get-discussion-thread", { rootHash })).toEqual({
      ok: false,
      name: "get-discussion-thread",
      statusCode: 502,
      error: "get-discussion-thread request failed: db fail",
    });
  });

  it("covers semantic-search-casts validation and embedding failure branches", async () => {
    expect(await executeTool("semantic-search-casts", {})).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 400,
      error: "query must be a string.",
    });
    expect(await executeTool("semantic-search-casts", { query: "   " })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 400,
      error: "query must not be empty.",
    });
    expect(await executeTool("semantic-search-casts", { query: "x", limit: "bad" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 400,
      error: "limit must be an integer.",
    });
    expect(await executeTool("semantic-search-casts", { query: "x", limit: 30 })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 400,
      error: "limit must be between 1 and 25.",
    });
    expect(await executeTool("semantic-search-casts", { query: "x", rootHash: "bad" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 400,
      error: "rootHash must be a full cast hash (0x + 40 hex chars).",
    });

    delete process.env.OPENAI_API_KEY;
    expect(await executeTool("semantic-search-casts", { query: "x" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 503,
      error: "semantic-search-casts request failed: OPENAI_API_KEY is not configured.",
    });

    process.env.OPENAI_API_KEY = "key";
    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })),
    );
    expect(await executeTool("semantic-search-casts", { query: "x" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 502,
      error: "semantic-search-casts request failed: OpenAI embeddings request failed with status 500",
    });

    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(new Response("{bad", { status: 200 })),
    );
    expect(await executeTool("semantic-search-casts", { query: "x" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 502,
      error: "semantic-search-casts request failed: OpenAI embeddings returned invalid JSON.",
    });

    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    expect(await executeTool("semantic-search-casts", { query: "x" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 502,
      error: "semantic-search-casts request failed: OpenAI embeddings response is missing data.",
    });

    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [{}] }), { status: 200 })),
    );
    expect(await executeTool("semantic-search-casts", { query: "x" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 502,
      error: "semantic-search-casts request failed: OpenAI embeddings response is missing embedding values.",
    });

    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ embedding: [] }] }), { status: 200 }),
      ),
    );
    expect(await executeTool("semantic-search-casts", { query: "x" })).toEqual({
      ok: false,
      name: "semantic-search-casts",
      statusCode: 502,
      error: "semantic-search-casts request failed: OpenAI embeddings dimension mismatch: expected 256, got 0",
    });
  });

  it("executes semantic-search-casts without rootHash and normalizes nullable rows", async () => {
    process.env.OPENAI_API_KEY = "key";
    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(embeddingPayload()), { status: 200 })),
    );
    mocks.execute.mockResolvedValueOnce({
      rows: [
        {
          hashHex: "f".repeat(40),
          parentHashHex: null,
          rootHashHex: "f".repeat(40),
          text: null,
          castTimestamp: null,
          distance: null,
          authorFid: null,
          authorFname: null,
          authorDisplayName: null,
          authorAvatarUrl: null,
          authorNeynarScore: null,
        },
      ],
    });

    const result = await executeTool("semantic-search-casts", { query: "nullable row test" });
    expect(result).toMatchObject({
      ok: true,
      output: {
        query: "nullable row test",
        count: 1,
        items: [
          {
            hash: `0x${"f".repeat(40)}`,
            parentHash: null,
            rootHash: `0x${"f".repeat(40)}`,
            text: "",
            authorUsername: "unknown",
            createdAt: null,
            distance: 1,
            similarity: 0,
            author: {
              fid: null,
              username: "unknown",
              display_name: null,
              pfp_url: null,
              neynar_score: null,
            },
          },
        ],
      },
    });
    if (result.ok) {
      expect(result.output).not.toHaveProperty("rootHash");
    }
  });

  it("uses fid fallback for author usernames when fname/display are missing", async () => {
    process.env.OPENAI_API_KEY = "key";
    mocks.createTimeoutFetch.mockReturnValueOnce(
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(embeddingPayload()), { status: 200 })),
    );
    mocks.execute.mockResolvedValueOnce({
      rows: [
        {
          hashHex: "9".repeat(40),
          parentHashHex: null,
          rootHashHex: "9".repeat(40),
          text: "fallback user",
          castTimestamp: "2026-03-02T00:00:00.000Z",
          distance: 0.1,
          authorFid: 88,
          authorFname: null,
          authorDisplayName: null,
          authorAvatarUrl: null,
          authorNeynarScore: 0.6,
        },
      ],
    });

    const result = await executeTool("semantic-search-casts", { query: "fid fallback" });
    expect(result).toMatchObject({
      ok: true,
      output: {
        items: [
          {
            hash: `0x${"9".repeat(40)}`,
            authorUsername: "fid:88",
            author: {
              fid: 88,
              username: "fid:88",
            },
          },
        ],
      },
    });
  });

  it("covers get-treasury-stats unknown-error fallback message", async () => {
    mocks.getCobuildAiContextSnapshot.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await executeTool("get-treasury-stats", {});
    expect(result).toEqual({
      ok: false,
      name: "get-treasury-stats",
      statusCode: 502,
      error: "get-treasury-stats request failed: unknown error",
    });
  });
});
