import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enforceBuildBotToolsRateLimit,
  handleBuildBotToolsCastPreviewRequest,
  handleBuildBotToolsCobuildAiContextRequest,
  handleBuildBotToolsGetCastRequest,
  handleBuildBotToolsGetUserRequest,
} from "../../../src/api/buildbot-tools/route";
import { createReply } from "../../utils/fastify";

const mocks = vi.hoisted(() => ({
  getUsage: vi.fn(),
  recordUsage: vi.fn(),
  getOrSetCachedResultWithLock: vi.fn(),
  select: vi.fn(),
  getNeynarClient: vi.fn(),
  withTimeout: vi.fn(),
  getCobuildAiContextSnapshot: vi.fn(),
}));

vi.mock("../../../src/infra/rate-limit", () => ({
  getUsage: mocks.getUsage,
  recordUsage: mocks.recordUsage,
}));

vi.mock("../../../src/infra/cache/cacheResult", () => ({
  getOrSetCachedResultWithLock: mocks.getOrSetCachedResultWithLock,
}));

vi.mock("../../../src/infra/db/cobuildDb", () => ({
  cobuildDb: {
    select: mocks.select,
  },
}));

vi.mock("../../../src/infra/neynar/client", () => ({
  getNeynarClient: mocks.getNeynarClient,
}));

vi.mock("../../../src/infra/http/timeout", () => ({
  withTimeout: mocks.withTimeout,
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

function buildRequest<TBody>(body: TBody): FastifyRequest<{ Body: TBody }> {
  return {
    body,
    ip: "127.0.0.1",
    headers: {},
  } as unknown as FastifyRequest<{ Body: TBody }>;
}

describe("buildbot tools api route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrSetCachedResultWithLock.mockImplementation(async (_key, _prefix, fetchFn) => {
      return await fetchFn();
    });
  });

  describe("enforceBuildBotToolsRateLimit", () => {
    it("allows requests below the limit and records usage", async () => {
      mocks.getUsage.mockResolvedValueOnce(0);
      mocks.recordUsage.mockResolvedValueOnce(undefined);
      const request = {
        ip: "127.0.0.1",
        headers: { authorization: "Bearer super-secret-token" },
      } as unknown as FastifyRequest;
      const reply = createReply();

      await enforceBuildBotToolsRateLimit(request, reply);

      expect(mocks.getUsage).toHaveBeenCalledTimes(1);
      expect(String(mocks.getUsage.mock.calls[0]?.[0])).toContain("buildbot-tools:token:");
      expect(String(mocks.getUsage.mock.calls[0]?.[0])).not.toContain("super-secret-token");
      expect(mocks.recordUsage).toHaveBeenCalledWith(
        expect.stringContaining("buildbot-tools:token:"),
        1,
      );
      expect(reply.status).not.toHaveBeenCalled();
    });

    it("rate limits when usage exceeds the threshold", async () => {
      mocks.getUsage.mockResolvedValueOnce(999_999);
      const request = {
        ip: "127.0.0.1",
        headers: {},
      } as unknown as FastifyRequest;
      const reply = createReply();

      await enforceBuildBotToolsRateLimit(request, reply);

      expect(mocks.recordUsage).not.toHaveBeenCalled();
      expect(reply.header).toHaveBeenCalledWith("Retry-After", expect.any(String));
      expect(reply.status).toHaveBeenCalledWith(429);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Too many Build Bot tool requests. Please retry shortly.",
      });
      expect(String(mocks.getUsage.mock.calls[0]?.[0])).toBe("buildbot-tools:ip:127.0.0.1");
    });

    it("returns 503 when rate limiting backend fails", async () => {
      mocks.getUsage.mockRejectedValueOnce(new Error("redis unavailable"));
      const request = {
        ip: "127.0.0.1",
        headers: {},
      } as unknown as FastifyRequest;
      const reply = createReply();

      await enforceBuildBotToolsRateLimit(request, reply);

      expect(reply.status).toHaveBeenCalledWith(503);
      expect(reply.send).toHaveBeenCalledWith({
        error: "Build Bot tool rate limiting is temporarily unavailable. Please retry.",
      });
    });
  });

  describe("handleBuildBotToolsGetUserRequest", () => {
    it("returns exact farcaster profile matches", async () => {
      mocks.select.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                {
                  fid: 123n,
                  fname: "alice",
                  verifiedAddresses: ["0xabc"],
                },
              ]),
          }),
        }),
      });
      const reply = createReply();

      await handleBuildBotToolsGetUserRequest(buildRequest({ fname: "alice" }), reply);

      expect(reply.header).toHaveBeenCalledWith("Cache-Control", "private, max-age=60");
      expect(reply.send).toHaveBeenCalledWith({
        ok: true,
        result: {
          fid: 123n,
          fname: "alice",
          addresses: ["0xabc"],
        },
      });
    });

    it("returns fuzzy farcaster profile matches when exact match is missing", async () => {
      mocks.select
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () =>
              Promise.resolve([
                {
                  fid: 321n,
                  fname: "alice-builder",
                },
              ]),
          }),
        });

      const reply = createReply();
      await handleBuildBotToolsGetUserRequest(buildRequest({ fname: "ali" }), reply);

      expect(reply.send).toHaveBeenCalledWith({
        ok: true,
        result: {
          usedLikeQuery: true,
          users: [{ fid: 321n, fname: "alice-builder" }],
        },
      });
    });

    it("returns 400 for blank fname", async () => {
      const reply = createReply();

      await handleBuildBotToolsGetUserRequest(buildRequest({ fname: "  " }), reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: "fname must not be empty." });
    });

    it("returns 502 when caching/db lookup fails", async () => {
      mocks.getOrSetCachedResultWithLock.mockRejectedValueOnce(new Error("db down"));
      const reply = createReply();

      await handleBuildBotToolsGetUserRequest(buildRequest({ fname: "alice" }), reply);

      expect(reply.status).toHaveBeenCalledWith(502);
      expect(reply.send).toHaveBeenCalledWith({
        error: expect.stringContaining("get-user request failed:"),
      });
    });
  });

  describe("handleBuildBotToolsGetCastRequest", () => {
    it("returns cast details on success", async () => {
      mocks.getNeynarClient.mockReturnValueOnce({
        lookupCastByHashOrUrl: vi.fn(),
      });
      mocks.withTimeout.mockResolvedValueOnce({
        cast: { hash: "0xabc", text: "hello world" },
      });
      const reply = createReply();

      await handleBuildBotToolsGetCastRequest(
        buildRequest({ identifier: "0xabc", type: "hash" }),
        reply,
      );

      expect(reply.header).toHaveBeenCalledWith("Cache-Control", "private, max-age=60");
      expect(reply.send).toHaveBeenCalledWith({
        ok: true,
        cast: { hash: "0xabc", text: "hello world" },
      });
    });

    it("returns 404 when cast cannot be found", async () => {
      mocks.getOrSetCachedResultWithLock.mockResolvedValueOnce(null);
      const reply = createReply();

      await handleBuildBotToolsGetCastRequest(
        buildRequest({ identifier: "0xmissing", type: "hash" }),
        reply,
      );

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: "Cast not found." });
    });

    it("returns 503 when neynar API key is missing", async () => {
      mocks.getNeynarClient.mockReturnValueOnce(null);
      const reply = createReply();

      await handleBuildBotToolsGetCastRequest(
        buildRequest({ identifier: "0xabc", type: "hash" }),
        reply,
      );

      expect(reply.status).toHaveBeenCalledWith(503);
      expect(reply.send).toHaveBeenCalledWith({
        error: "get-cast request failed: Neynar API key is not configured.",
      });
    });

    it("returns 400 for blank cast identifier", async () => {
      const reply = createReply();

      await handleBuildBotToolsGetCastRequest(
        buildRequest({ identifier: "   ", type: "hash" }),
        reply,
      );

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: "identifier must not be empty." });
    });

    it("returns 502 for upstream failures", async () => {
      mocks.getNeynarClient.mockReturnValueOnce({
        lookupCastByHashOrUrl: vi.fn(),
      });
      mocks.withTimeout.mockRejectedValueOnce(new Error("timeout"));
      const reply = createReply();

      await handleBuildBotToolsGetCastRequest(
        buildRequest({ identifier: "0xabc", type: "hash" }),
        reply,
      );

      expect(reply.status).toHaveBeenCalledWith(502);
      expect(reply.send).toHaveBeenCalledWith({
        error: "get-cast request failed: timeout",
      });
    });
  });

  describe("handleBuildBotToolsCastPreviewRequest", () => {
    it("returns preview payload for valid input", async () => {
      const reply = createReply();
      await handleBuildBotToolsCastPreviewRequest(
        buildRequest({
          text: "hello",
          embeds: [{ url: "https://image.test/1.png" }],
          parent: "0xparent",
        }),
        reply,
      );

      expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
      expect(reply.send).toHaveBeenCalledWith({
        ok: true,
        cast: {
          text: "hello",
          embeds: [{ url: "https://image.test/1.png" }],
          parent: "0xparent",
        },
      });
    });

    it("returns 400 for blank cast text", async () => {
      const reply = createReply();
      await handleBuildBotToolsCastPreviewRequest(buildRequest({ text: "   " }), reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: "text must not be empty." });
    });
  });

  describe("handleBuildBotToolsCobuildAiContextRequest", () => {
    it("returns cached cobuild context snapshot", async () => {
      mocks.getCobuildAiContextSnapshot.mockResolvedValueOnce({
        data: { asOf: "2026-02-25T00:00:00.000Z" },
      });
      const reply = createReply();

      await handleBuildBotToolsCobuildAiContextRequest(buildRequest({}), reply);

      expect(reply.header).toHaveBeenCalledWith("Cache-Control", "public, max-age=60");
      expect(reply.send).toHaveBeenCalledWith({
        ok: true,
        data: { asOf: "2026-02-25T00:00:00.000Z" },
      });
    });

    it("returns 502 when snapshot is unavailable", async () => {
      mocks.getCobuildAiContextSnapshot.mockResolvedValueOnce({
        data: null,
        error: "upstream failed",
      });
      const reply = createReply();

      await handleBuildBotToolsCobuildAiContextRequest(buildRequest({}), reply);

      expect(reply.status).toHaveBeenCalledWith(502);
      expect(reply.send).toHaveBeenCalledWith({
        error: "cobuild-ai-context request failed: upstream failed",
      });
    });

    it("returns 502 when snapshot loading throws", async () => {
      mocks.getCobuildAiContextSnapshot.mockRejectedValueOnce(new Error("boom"));
      const reply = createReply();

      await handleBuildBotToolsCobuildAiContextRequest(buildRequest({}), reply);

      expect(reply.status).toHaveBeenCalledWith(502);
      expect(reply.send).toHaveBeenCalledWith({
        error: "cobuild-ai-context request failed: boom",
      });
    });
  });
});
