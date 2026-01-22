import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestContext } from "@fastify/request-context";
import { getChatUserOrThrow, validateChatUser } from "../../../src/api/auth/validate-chat-user";
import { getUserAddressFromToken } from "../../../src/api/auth/get-user-from-token";
import { createReply } from "../../utils/fastify";
import { buildChatUser } from "../../utils/fixtures/chat-user";

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
const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv };
});

describe("validateChatUser", () => {
  it("returns 401 when privy token is missing", async () => {
    const reply = createReply();
    await validateChatUser({ headers: {} } as FastifyRequest, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Missing privy id token" });
    expect(getUserAddressFromTokenMock).not.toHaveBeenCalled();
  });

  it("returns 401 when token header is not a string", async () => {
    const reply = createReply();
    await validateChatUser(
      { headers: { "privy-id-token": ["token"] } } as unknown as FastifyRequest,
      reply,
    );

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Missing privy id token" });
  });

  it("returns 401 when token is invalid", async () => {
    getUserAddressFromTokenMock.mockResolvedValue(undefined);

    const reply = createReply();
    await validateChatUser(
      { headers: { "privy-id-token": "token" } } as unknown as FastifyRequest,
      reply,
    );

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Invalid chat user" });
  });

  it("returns 401 when address normalization fails", async () => {
    getUserAddressFromTokenMock.mockResolvedValue("not-an-address");

    const reply = createReply();
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

    const reply = createReply();
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

    expect(setSpy).toHaveBeenCalledWith(
      "user",
      buildChatUser({
        address: "0xabc0000000000000000000000000000000000000",
        city: "LA",
        country: "US",
        countryRegion: "CA",
        userAgent: "agent",
      }),
    );
  });

  it("stores null location details when headers are missing", async () => {
    getUserAddressFromTokenMock.mockResolvedValue(
      "0xAbC0000000000000000000000000000000000000",
    );
    const setSpy = vi.spyOn(requestContext, "set");

    const reply = createReply();
    await validateChatUser(
      { headers: { "privy-id-token": "token" } } as unknown as FastifyRequest,
      reply,
    );

    expect(setSpy).toHaveBeenCalledWith("user", buildChatUser());
  });

  it("logs and rethrows when token verification fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getUserAddressFromTokenMock.mockRejectedValue(new Error("boom"));

    const reply = createReply();
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

  it("uses x-chat-user when self-hosted mode is enabled", async () => {
    process.env.SELF_HOSTED_MODE = "true";
    const setSpy = vi.spyOn(requestContext, "set");
    const reply = createReply();

    await validateChatUser(
      {
        headers: {
          "x-chat-user": "0xAbC0000000000000000000000000000000000000",
        },
      } as unknown as FastifyRequest,
      reply,
    );

    expect(setSpy).toHaveBeenCalledWith(
      "user",
      buildChatUser({
        address: "0xabc0000000000000000000000000000000000000",
      }),
    );
    expect(getUserAddressFromTokenMock).not.toHaveBeenCalled();
  });

  it("requires chat auth when a self-hosted shared secret is set", async () => {
    process.env.SELF_HOSTED_MODE = "true";
    process.env.SELF_HOSTED_SHARED_SECRET = "secret";
    const reply = createReply();

    await validateChatUser(
      {
        headers: {
          "x-chat-user": "0xAbC0000000000000000000000000000000000000",
        },
      } as unknown as FastifyRequest,
      reply,
    );

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Missing chat auth" });
  });

  it("rejects invalid chat auth in self-hosted mode", async () => {
    process.env.SELF_HOSTED_MODE = "true";
    process.env.SELF_HOSTED_SHARED_SECRET = "secret";
    const reply = createReply();

    await validateChatUser(
      {
        headers: {
          "x-chat-user": "0xAbC0000000000000000000000000000000000000",
          "x-chat-auth": "wrong",
        },
      } as unknown as FastifyRequest,
      reply,
    );

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Invalid chat auth" });
  });

  it("accepts valid chat auth in self-hosted mode", async () => {
    process.env.SELF_HOSTED_MODE = "true";
    process.env.SELF_HOSTED_SHARED_SECRET = "secret";
    const setSpy = vi.spyOn(requestContext, "set");
    const reply = createReply();

    await validateChatUser(
      {
        headers: {
          "x-chat-user": "0xAbC0000000000000000000000000000000000000",
          "x-chat-auth": "secret",
        },
      } as unknown as FastifyRequest,
      reply,
    );

    expect(setSpy).toHaveBeenCalledWith(
      "user",
      buildChatUser({
        address: "0xabc0000000000000000000000000000000000000",
      }),
    );
  });

  it("falls back to default address in self-hosted mode", async () => {
    process.env.SELF_HOSTED_MODE = "true";
    process.env.SELF_HOSTED_DEFAULT_ADDRESS =
      "0xAbC0000000000000000000000000000000000000";
    const setSpy = vi.spyOn(requestContext, "set");
    const reply = createReply();

    await validateChatUser({ headers: {} } as FastifyRequest, reply);

    expect(setSpy).toHaveBeenCalledWith(
      "user",
      buildChatUser({
        address: "0xabc0000000000000000000000000000000000000",
      }),
    );
  });

  it("returns 401 when self-hosted mode is enabled without a user", async () => {
    process.env.SELF_HOSTED_MODE = "true";
    const reply = createReply();

    await validateChatUser({ headers: {} } as FastifyRequest, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Missing chat user" });
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
