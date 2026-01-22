import type { FastifyReply, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestContext } from "@fastify/request-context";
import { getChatUserOrThrow, validateChatUser } from "../../../src/api/auth/validate-chat-user";
import { getUserAddressFromToken } from "../../../src/api/auth/get-user-from-token";

vi.mock("../../../src/api/auth/get-user-from-token", () => ({
  getUserAddressFromToken: vi.fn(),
}));

vi.mock("@fastify/request-context", () => ({
  requestContext: {
    set: vi.fn(),
    get: vi.fn(),
  },
}));

const getUserAddressFromTokenMock = vi.mocked(getUserAddressFromToken);

const buildReply = () =>
  ({
    code: vi.fn().mockReturnThis(),
    send: vi.fn(),
  }) as unknown as FastifyReply;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateChatUser", () => {
  it("returns 401 when privy token is missing", async () => {
    const reply = buildReply();
    await validateChatUser({ headers: {} } as FastifyRequest, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Missing privy id token" });
    expect(getUserAddressFromTokenMock).not.toHaveBeenCalled();
  });

  it("returns 401 when token is invalid", async () => {
    getUserAddressFromTokenMock.mockResolvedValue(undefined);

    const reply = buildReply();
    await validateChatUser(
      { headers: { "privy-id-token": "token" } } as unknown as FastifyRequest,
      reply,
    );

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Invalid chat user" });
  });

  it("stores a normalized user in request context", async () => {
    getUserAddressFromTokenMock.mockResolvedValue(
      "0xAbC0000000000000000000000000000000000000",
    );
    const setSpy = vi.spyOn(requestContext, "set");

    const reply = buildReply();
    await validateChatUser(
      {
        headers: {
          "privy-id-token": "token",
          city: "LA",
          country: "US",
          "country-region": "CA",
          "user-agent": "agent",
        },
      } as unknown as FastifyRequest,
      reply,
    );

    expect(setSpy).toHaveBeenCalledWith("user", {
      address: "0xabc0000000000000000000000000000000000000",
      city: "LA",
      country: "US",
      countryRegion: "CA",
      userAgent: "agent",
    });
  });

  it("logs and rethrows when token verification fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getUserAddressFromTokenMock.mockRejectedValue(new Error("boom"));

    const reply = buildReply();
    await expect(
      validateChatUser(
        { headers: { "privy-id-token": "token" } } as unknown as FastifyRequest,
        reply,
      ),
    ).rejects.toThrow("boom");

    expect(errorSpy).toHaveBeenCalledWith(
      "Error in validateChatUser middleware:",
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});

describe("getChatUserOrThrow", () => {
  it("returns the user when present", () => {
    vi.spyOn(requestContext, "get").mockReturnValue({
      address: "0xabc",
      city: null,
      country: null,
      countryRegion: null,
      userAgent: null,
    });

    expect(getChatUserOrThrow().address).toBe("0xabc");
  });

  it("throws when no user is in context", () => {
    vi.spyOn(requestContext, "get").mockReturnValue(undefined);
    expect(() => getChatUserOrThrow()).toThrow("User not found");
  });
});
