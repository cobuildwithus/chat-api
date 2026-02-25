import { describe, expect, it, vi } from "vitest";
import { handleError } from "../../src/api/server-helpers";
import { createReply } from "../utils/fastify";

describe("handleError", () => {
  it("returns structured error details when status is provided", () => {
    const reply = createReply();
    const error = Object.assign(new Error("Bad"), { statusCode: 400, name: "BadRequest" });

    handleError(error, { method: "GET", url: "/", headers: {}, body: null }, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: "BadRequest",
      message: "Bad",
      statusCode: 400,
    });
  });

  it("defaults to internal server error when fields are missing", () => {
    const reply = createReply();
    handleError({}, { method: "GET", url: "/", headers: {}, body: null }, reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Internal Server Error",
      message: "An unexpected error occurred",
      statusCode: 500,
    });
  });

  it("redacts sensitive headers in error logs", () => {
    const reply = createReply();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    handleError(
      new Error("oops"),
      {
        method: "POST",
        url: "/api/chat",
        headers: {
          "privy-id-token": "secret-token",
          "x-chat-internal-key": "internal-secret",
          "x-safe-header": "safe-value",
        },
        body: { query: "hello" },
      },
      reply,
    );

    expect(errorSpy).toHaveBeenCalledWith("Request details:", {
      method: "POST",
      url: "/api/chat",
      headers: {
        "privy-id-token": "[redacted]",
        "x-chat-internal-key": "[redacted]",
        "x-safe-header": "safe-value",
      },
      body: { query: "hello" },
    });
    errorSpy.mockRestore();
  });

  it("passes through non-object headers unchanged in logs", () => {
    const reply = createReply();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    handleError(
      new Error("oops"),
      {
        method: "POST",
        url: "/api/chat",
        headers: "raw-headers",
        body: null,
      },
      reply,
    );

    expect(errorSpy).toHaveBeenCalledWith("Request details:", {
      method: "POST",
      url: "/api/chat",
      headers: "raw-headers",
      body: null,
    });
    errorSpy.mockRestore();
  });
});
