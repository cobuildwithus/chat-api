import fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  farcasterWalletLinkSchema,
  parseFarcasterWalletLinkBody,
} from "../../../src/api/farcaster-wallet-link/schema";
import { handleError } from "../../../src/api/server-helpers";

type ValidationEnvelope = {
  error: string;
  message: string;
  requestId: string;
  statusCode: number;
};

async function buildValidationApp(): Promise<{
  app: FastifyInstance;
  handleWalletLink: ReturnType<typeof vi.fn>;
}> {
  const app = fastify();
  const handleWalletLink = vi.fn(async (request: { body: unknown }) =>
    parseFarcasterWalletLinkBody(request.body),
  );

  app.post(
    "/v1/farcaster/profiles/link-wallet",
    { schema: farcasterWalletLinkSchema },
    handleWalletLink,
  );
  app.setErrorHandler(handleError);

  await app.ready();

  return { app, handleWalletLink };
}

function expectStableValidationEnvelope(body: unknown): asserts body is ValidationEnvelope {
  expect(body).toEqual({
    error: expect.any(String),
    message: expect.any(String),
    requestId: expect.any(String),
    statusCode: 400,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("farcaster wallet-link schema runtime parity", () => {
  it("rejects malformed addresses at the route layer before handler execution", async () => {
    expect(() =>
      parseFarcasterWalletLinkBody({
        fid: 123,
        address: "0x1234",
      }),
    ).toThrow();

    const { app, handleWalletLink } = await buildValidationApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/farcaster/profiles/link-wallet",
      headers: {
        authorization: "Bearer bbt_test",
      },
      payload: {
        fid: 123,
        address: "0x1234",
      },
    });

    expect(handleWalletLink).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(400);

    const body = response.json();
    expectStableValidationEnvelope(body);
    expect(body.message).toContain("address");

    await app.close();
  });
});
