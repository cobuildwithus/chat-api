import { importPKCS8, SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import {
  signCliAccessToken,
  verifyCliAccessToken,
} from "../../../src/api/oauth/jwt";
import {
  getBuildBotJwtAudience,
  getBuildBotJwtIssuer,
  getBuildBotJwtPrivateKey,
} from "../../../src/config/env";

describe("oauth jwt helpers", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("signs and verifies CLI access tokens", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
    };

    const token = await signCliAccessToken({
      sub: "0x0000000000000000000000000000000000000001",
      sid: "session-1",
      agentKey: "default",
      scope: "tools:read wallet:execute offline_access",
    });

    const claims = await verifyCliAccessToken(token);
    expect(claims).toEqual(
      expect.objectContaining({
        sub: "0x0000000000000000000000000000000000000001",
        sid: "session-1",
        agentKey: "default",
        scope: "tools:read wallet:execute offline_access",
      }),
    );
  });

  it("returns null for invalid token signatures", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
    };

    const claims = await verifyCliAccessToken("not.a.valid.jwt");
    expect(claims).toBeNull();
  });

  it("returns null when token is validly signed but missing required claims", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
    };
    const privateKeyPem = getBuildBotJwtPrivateKey().replace(/\\n/g, "\n").trim();
    const privateKey = await importPKCS8(privateKeyPem, "ES256");
    const issuer = getBuildBotJwtIssuer();
    const audience = getBuildBotJwtAudience();

    const missingClaimsToken = await new SignJWT({
      scope: "tools:read offline_access",
    })
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setSubject("0x0000000000000000000000000000000000000001")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(privateKey);

    const claims = await verifyCliAccessToken(missingClaimsToken);
    expect(claims).toBeNull();
  });
});
