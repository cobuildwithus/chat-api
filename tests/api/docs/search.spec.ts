import type { FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enforceDocsSearchRateLimit,
  handleDocsSearchRequest,
} from "../../../src/api/docs/search";
import { createReply } from "../../utils/fastify";

const mocks = vi.hoisted(() => ({
  checkAndRecordUsage: vi.fn(),
}));

vi.mock("../../../src/infra/rate-limit", () => ({
  checkAndRecordUsage: mocks.checkAndRecordUsage,
}));

type DocsSearchBody = {
  query: string;
  limit?: number;
};

const buildRequest = (body: DocsSearchBody) =>
  ({ body } as unknown as FastifyRequest<{ Body: DocsSearchBody }>);

describe("handleDocsSearchRequest", () => {
  const originalEnv = process.env;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.DOCS_VECTOR_STORE_ID = "vs_test";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("returns search results from OpenAI vector store search output", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: [
            null,
            {
              ignored: true,
            },
            {
              file_id: "file_123",
              filename: "self-hosted/chat-api.mdx",
              score: 0.91,
              text: "This page explains Chat API deployment.",
              attributes: {
                path: "self-hosted/chat-api.mdx",
                slug: "/self-hosted/chat-api",
              },
            },
          ],
        }),
    });

    const reply = createReply();
    await handleDocsSearchRequest(buildRequest({ query: "chat api", limit: 5 }), reply);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe("https://api.openai.com/v1/vector_stores/vs_test/search");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      },
      redirect: "error",
    });
    expect(init?.signal).toBeDefined();
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "chat api",
      max_num_results: 5,
    });

    expect(reply.send).toHaveBeenCalledWith({
      query: "chat api",
      count: 2,
      results: [
        {
          fileId: null,
          filename: null,
          score: null,
          snippet: null,
          path: null,
          slug: null,
          url: null,
        },
        {
          fileId: "file_123",
          filename: "self-hosted/chat-api.mdx",
          score: 0.91,
          snippet: "This page explains Chat API deployment.",
          path: "self-hosted/chat-api.mdx",
          slug: "/self-hosted/chat-api",
          url: "https://docs.co.build/self-hosted/chat-api",
        },
      ],
    });
  });

  it("URL-encodes the vector store id in the upstream request path", async () => {
    process.env.DOCS_VECTOR_STORE_ID = "vs_test/with space";
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: [],
        }),
    });

    const reply = createReply();
    await handleDocsSearchRequest(buildRequest({ query: "setup" }), reply);

    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe("https://api.openai.com/v1/vector_stores/vs_test%2Fwith%20space/search");
  });

  it("accepts legacy Responses file search payload shape", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          output: [
            {
              type: "file_search_call",
              results: [
                {
                  file_id: "file_123",
                  filename: "self-hosted/chat-api.mdx",
                  score: 0.91,
                  text: "This page explains Chat API deployment.",
                  attributes: {
                    path: "self-hosted/chat-api.mdx",
                    slug: "/self-hosted/chat-api",
                  },
                },
              ],
            },
          ],
        }),
    });

    const reply = createReply();
    await handleDocsSearchRequest(buildRequest({ query: "chat api" }), reply);

    expect(reply.send).toHaveBeenCalledWith({
      query: "chat api",
      count: 1,
      results: [
        {
          fileId: "file_123",
          filename: "self-hosted/chat-api.mdx",
          score: 0.91,
          snippet: "This page explains Chat API deployment.",
          path: "self-hosted/chat-api.mdx",
          slug: "/self-hosted/chat-api",
          url: "https://docs.co.build/self-hosted/chat-api",
        },
      ],
    });
  });

  it("returns 503 when docs vector store is not configured", async () => {
    delete process.env.DOCS_VECTOR_STORE_ID;

    const reply = createReply();
    await handleDocsSearchRequest(buildRequest({ query: "setup" }), reply);

    expect(reply.status).toHaveBeenCalledWith(503);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Docs search is not configured (missing DOCS_VECTOR_STORE_ID).",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 when OpenAI key is not configured", async () => {
    delete process.env.OPENAI_API_KEY;

    const reply = createReply();
    await handleDocsSearchRequest(buildRequest({ query: "setup" }), reply);

    expect(reply.status).toHaveBeenCalledWith(503);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Docs search is not configured (missing OPENAI_API_KEY).",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when query is empty after trimming", async () => {
    const reply = createReply();
    await handleDocsSearchRequest(buildRequest({ query: "   " }), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Query must not be empty.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when upstream request fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    });

    const reply = createReply();
    await handleDocsSearchRequest(buildRequest({ query: "setup" }), reply);

    expect(reply.status).toHaveBeenCalledWith(502);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Docs search request failed: OpenAI vector store search request failed with status 502",
    });
  });

  it("returns 502 when OpenAI response is invalid JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "{ bad json",
    });

    const reply = createReply();
    await handleDocsSearchRequest(buildRequest({ query: "setup" }), reply);

    expect(reply.status).toHaveBeenCalledWith(502);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Docs search request failed: OpenAI vector store search returned invalid JSON.",
    });
  });

  it("extracts snippets from content arrays and normalizes slug/url", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: [
            null,
            "bad-shape",
            {
              file_id: "   ",
              filename: "  ",
              score: "n/a",
              content: [{ nope: true }, { text: "   " }, { text: "x".repeat(500) }],
              attributes: {
                path: "docs/setup",
                slug: "self-hosted/chat-api",
              },
            },
            {
              file_id: "file_2",
              filename: "index.mdx",
              score: 0.88,
              attributes: {},
            },
          ],
        }),
    });

    const reply = createReply();
    await handleDocsSearchRequest(buildRequest({ query: "setup" }), reply);

    expect(reply.send).toHaveBeenCalledWith({
      query: "setup",
      count: 2,
      results: [
        {
          fileId: null,
          filename: null,
          score: null,
          snippet: `${"x".repeat(420)}...`,
          path: "docs/setup",
          slug: "self-hosted/chat-api",
          url: "https://docs.co.build/self-hosted/chat-api",
        },
        {
          fileId: "file_2",
          filename: "index.mdx",
          score: 0.88,
          snippet: null,
          path: null,
          slug: null,
          url: null,
        },
      ],
    });
  });

  it("extracts snippets from legacy content arrays and normalizes slug/url", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          output: [
            {
              type: "file_search_call",
              results: [
                {
                  file_id: "   ",
                  filename: "  ",
                  score: "n/a",
                  content: [{ nope: true }, { text: "   " }, { text: "x".repeat(500) }],
                  attributes: {
                    path: "docs/setup",
                    slug: "self-hosted/chat-api",
                  },
                },
                {
                  file_id: "file_2",
                  filename: "index.mdx",
                  score: 0.88,
                  attributes: {},
                },
              ],
            },
          ],
        }),
    });

    const reply = createReply();
    await handleDocsSearchRequest(buildRequest({ query: "setup" }), reply);

    expect(reply.send).toHaveBeenCalledWith({
      query: "setup",
      count: 2,
      results: [
        {
          fileId: null,
          filename: null,
          score: null,
          snippet: `${"x".repeat(420)}...`,
          path: "docs/setup",
          slug: "self-hosted/chat-api",
          url: "https://docs.co.build/self-hosted/chat-api",
        },
        {
          fileId: "file_2",
          filename: "index.mdx",
          score: 0.88,
          snippet: null,
          path: null,
          slug: null,
          url: null,
        },
      ],
    });
  });

  it("handles non-error and string upstream failures with bounded messages", async () => {
    fetchMock.mockRejectedValueOnce({});
    const unknownReply = createReply();
    await handleDocsSearchRequest(buildRequest({ query: "setup" }), unknownReply);
    expect(unknownReply.status).toHaveBeenCalledWith(502);
    expect(unknownReply.send).toHaveBeenCalledWith({
      error: "Docs search request failed: Unknown error",
    });

    fetchMock.mockRejectedValueOnce("x".repeat(220));
    const stringReply = createReply();
    await handleDocsSearchRequest(buildRequest({ query: "setup" }), stringReply);

    const payload = stringReply.send.mock.calls[0]?.[0] as { error: string };
    expect(payload.error.startsWith("Docs search request failed:")).toBe(true);
    expect(payload.error.endsWith("...")).toBe(true);
    expect(payload.error.length).toBeLessThan(180);
  });
});

describe("enforceDocsSearchRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests below the limit and keys by ip", async () => {
    mocks.checkAndRecordUsage.mockResolvedValueOnce({
      allowed: true,
      usage: 1,
      retryAfterSeconds: 0,
    });
    const request = {
      ip: "127.0.0.1",
      headers: {},
    } as unknown as FastifyRequest;
    const reply = createReply();

    await enforceDocsSearchRateLimit(request, reply);

    expect(mocks.checkAndRecordUsage).toHaveBeenCalledWith("docs-search:ip:127.0.0.1", {
      windowMinutes: 1,
      maxUsage: 200,
      usageToAdd: 1,
    });
    expect(reply.status).not.toHaveBeenCalled();
  });

  it("applies retry headers on limit exceed", async () => {
    mocks.checkAndRecordUsage.mockResolvedValueOnce({
      allowed: false,
      usage: 200,
      retryAfterSeconds: 11,
    });
    const request = {
      ip: "127.0.0.1",
      headers: {},
    } as unknown as FastifyRequest;
    const reply = createReply();

    await enforceDocsSearchRateLimit(request, reply);

    expect(reply.header).toHaveBeenCalledWith("Retry-After", "11");
    expect(reply.status).toHaveBeenCalledWith(429);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Too many docs search requests. Please retry shortly.",
    });
  });

  it("returns 503 when rate limiting backend fails", async () => {
    mocks.checkAndRecordUsage.mockRejectedValueOnce(new Error("redis unavailable"));
    const request = {
      ip: "127.0.0.1",
      headers: {},
    } as unknown as FastifyRequest;
    const reply = createReply();

    await enforceDocsSearchRateLimit(request, reply);

    expect(reply.status).toHaveBeenCalledWith(503);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Docs search rate limiting is temporarily unavailable. Please retry.",
    });
  });

  it("falls back to unknown key when request ip is missing", async () => {
    mocks.checkAndRecordUsage.mockResolvedValueOnce({
      allowed: true,
      usage: 1,
      retryAfterSeconds: 0,
    });
    const request = {
      ip: " ",
      headers: {},
    } as unknown as FastifyRequest;
    const reply = createReply();

    await enforceDocsSearchRateLimit(request, reply);

    expect(mocks.checkAndRecordUsage).toHaveBeenCalledWith("docs-search:ip:unknown", {
      windowMinutes: 1,
      maxUsage: 200,
      usageToAdd: 1,
    });
  });
});
