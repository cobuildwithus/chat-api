import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COBUILD_AI_CONTEXT_URL,
  fetchCobuildAiContextFresh,
  formatCobuildAiContextError,
  getCobuildAiContextSnapshot,
} from "../../src/infra/cobuild-ai-context";
import { resetCacheMocks } from "../utils/mocks/cache";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  resetCacheMocks();
  global.fetch = fetchMock as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cobuild ai context", () => {
  it("formats errors consistently", () => {
    expect(formatCobuildAiContextError(new Error("boom"))).toBe("boom");
    expect(formatCobuildAiContextError("fail")).toBe("fail");
    expect(formatCobuildAiContextError({})).toBe("Unknown error");
    expect(formatCobuildAiContextError("x".repeat(200))).toHaveLength(120);
  });

  it("caches the ai context snapshot", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ hello: "world" }),
    });

    const first = await getCobuildAiContextSnapshot();
    const second = await getCobuildAiContextSnapshot();

    expect(first.data).toEqual({ hello: "world" });
    expect(second.data).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(COBUILD_AI_CONTEXT_URL, expect.any(Object));
  });

  it("returns an error when fetch fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const result = await getCobuildAiContextSnapshot();
    expect(result.data).toBeNull();
    expect(result.error).toBe("HTTP 500");
  });

  it("fetches fresh context with a custom timeout", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ hello: "fresh" }),
    });

    const result = await fetchCobuildAiContextFresh(1);
    expect(result).toEqual({ hello: "fresh" });
  });
});
