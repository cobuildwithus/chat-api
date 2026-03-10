import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { setRequestUserFromHeaders } from "../../../src/api/auth/set-request-user";
import { setChatUserPrincipalFromRequest } from "../../../src/api/auth/principals";

vi.mock("../../../src/api/auth/principals", () => ({
  setChatUserPrincipalFromRequest: vi.fn(),
}));

describe("setRequestUserFromHeaders", () => {
  it("delegates to setChatUserPrincipalFromRequest", () => {
    const request = {
      headers: {
        "user-agent": "agent",
      },
    } as unknown as FastifyRequest;

    setRequestUserFromHeaders("0x0000000000000000000000000000000000000001", request);

    expect(setChatUserPrincipalFromRequest).toHaveBeenCalledWith(
      "0x0000000000000000000000000000000000000001",
      request,
    );
  });
});
