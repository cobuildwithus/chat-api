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
        id: "req-1",
        method: "POST",
        url: "/api/chat",
        headers: {
          authorization: "Bearer token",
          cookie: "session=abc",
          "privy-id-token": "secret-token",
          "x-chat-auth": "chat-auth-secret",
          "x-chat-grant": "grant-token",
          "x-chat-internal-key": "internal-secret",
          "x-safe-header": "safe-value",
        },
        body: { id: "chat-1", type: "chat-default", messages: [{}, {}], query: "hello" },
      },
      reply,
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "Request details:",
      expect.objectContaining({
        requestId: "req-1",
        method: "POST",
        url: "/api/chat",
        headers: {
          authorization: "[redacted]",
          cookie: "[redacted]",
          "privy-id-token": "[redacted]",
          "x-chat-auth": "[redacted]",
          "x-chat-grant": "[redacted]",
          "x-chat-internal-key": "[redacted]",
          "x-safe-header": "safe-value",
        },
        bodySummary: {
          id: "chat-1",
          type: "chat-default",
          messageCount: 2,
          queryLength: 5,
        },
      }),
    );
    errorSpy.mockRestore();
  });

  it("returns generic 500 details in production", () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, NODE_ENV: "production" };
    const reply = createReply();

    handleError(
      Object.assign(new Error("Database exploded"), { statusCode: 500, name: "DatabaseError" }),
      { id: "req-prod", method: "GET", url: "/api/chat", headers: {}, body: null },
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Internal Server Error",
      message: "Internal Server Error",
      statusCode: 500,
      requestId: "req-prod",
    });
    process.env = originalEnv;
  });

  it("passes through non-object headers unchanged in logs", () => {
    const reply = createReply();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    handleError(
      new Error("oops"),
      {
        id: "req-2",
        method: "POST",
        url: "/api/chat",
        headers: "raw-headers",
        body: null,
      },
      reply,
    );

    expect(errorSpy).toHaveBeenCalledWith("Request details:", {
      requestId: "req-2",
      method: "POST",
      url: "/api/chat",
      headers: "raw-headers",
      bodySummary: null,
    });
    errorSpy.mockRestore();
  });
});
