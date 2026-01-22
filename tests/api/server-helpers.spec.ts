import { describe, expect, it } from "vitest";
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
});
