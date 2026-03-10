import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleCobuildAiContextRequest } from "../../../src/api/cobuild-ai-context/route";
import { createReply } from "../../utils/fastify";

const mocks = vi.hoisted(() => ({
  getCobuildAiContextSnapshot: vi.fn(),
}));

vi.mock("../../../src/infra/cobuild-ai-context", () => ({
  getCobuildAiContextSnapshot: mocks.getCobuildAiContextSnapshot,
}));

describe("handleCobuildAiContextRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns snapshot data with cache headers when available", async () => {
    mocks.getCobuildAiContextSnapshot.mockResolvedValueOnce({
      data: { asOf: "2026-03-02T00:00:00.000Z", foo: "bar" },
      error: null,
    });
    const reply = createReply();

    await handleCobuildAiContextRequest({} as FastifyRequest, reply);

    expect(reply.header).toHaveBeenCalledWith(
      "Cache-Control",
      "public, max-age=900, stale-while-revalidate=300",
    );
    expect(reply.send).toHaveBeenCalledWith({
      asOf: "2026-03-02T00:00:00.000Z",
      foo: "bar",
    });
  });

  it("returns 502 when snapshot data is unavailable", async () => {
    mocks.getCobuildAiContextSnapshot.mockResolvedValueOnce({
      data: null,
      error: "upstream failed",
    });
    const reply = createReply();

    await handleCobuildAiContextRequest({} as FastifyRequest, reply);

    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.status).toHaveBeenCalledWith(502);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Cobuild AI context unavailable.",
    });
  });

  it("uses unknown error fallback when snapshot has no error string", async () => {
    mocks.getCobuildAiContextSnapshot.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const reply = createReply();

    await handleCobuildAiContextRequest({} as FastifyRequest, reply);

    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.status).toHaveBeenCalledWith(502);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Cobuild AI context unavailable.",
    });
  });

  it("sanitizes thrown snapshot failures instead of surfacing raw internal exception text", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getCobuildAiContextSnapshot.mockRejectedValueOnce(
      new Error("database password mismatch"),
    );
    const reply = createReply();

    await handleCobuildAiContextRequest({} as FastifyRequest, reply);

    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.status).toHaveBeenCalledWith(502);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Cobuild AI context unavailable.",
    });
    expect(reply.send).not.toHaveBeenCalledWith({
      error: "database password mismatch",
    });
    errorSpy.mockRestore();
  });
});
